# Telegram integration HTTP API (machine-oriented spec)

Use this document when wiring a **Telegram bot**, **CI job**, or **any HTTP client** to Tri State Coverage’s backend. It is written for **deterministic parsing** by humans and AI tools.

---

## Metadata (for tooling)

```yaml
api_name: tri_state_coverage_telegram_integration
base_path: /api/integrations/telegram
protocol: https
request_encoding_post: multipart/form-data   # NOT application/json
response_encoding: application/json
auth_style: shared_secret_header
server_runtime: nodejs                       # Next.js route handler
```

---

## Purpose

**POST** attaches an insurance-card **PDF** to an existing client **matched by full display name**, saves it to Supabase Storage, updates `profiles.insurance_card_pdf_path`, and emails the client using the same policy template as admin flows (PDF attached when email succeeds).

**GET** is optional: validates the secret and confirms the route is deployed.

---

## URLs

Replace `{ORIGIN}` with the deployed site origin (no trailing slash).

| Method | Path | Role |
|--------|------|------|
| `POST` | `{ORIGIN}/api/integrations/telegram` | Upload PDF + match client by name |
| `GET` | `{ORIGIN}/api/integrations/telegram` | Health / contract reminder |

---

## Authentication

All requests **must** include the integration secret using **exactly one** of:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <SECRET>` (case-insensitive `Bearer` prefix) |
| `X-Telegram-Integration-Secret` | `<SECRET>` |
| `X-Api-Key` | `<SECRET>` |

The server reads the secret from environment variable **`TELEGRAM_INTEGRATION_SECRET`** or alias **`TELEGRAM_BOT_API_SECRET`**.

**Rules for callers:**

- Treat `<SECRET>` as an opaque string; no encoding beyond UTF-8 header bytes.
- Wrong or missing secret → **401** JSON `{ "ok": false, "error": "Unauthorized" }`.
- If the server has no secret configured, authenticated-looking requests can still fail with **503** (see error matrix).

---

## POST: attach PDF and notify client

### Request

- **Content-Type:** `multipart/form-data` (let the HTTP client set boundary automatically).
- **Do not** send JSON bodies for this endpoint.

#### Form fields

| Field name | Required | Type | Constraints |
|------------|----------|------|----------------|
| `fullName` **or** `name` | Yes | text | Must match `profiles.name` after normalization (see below). |
| `file` | Yes | file | Single PDF; max **5_242_880** bytes (5 MiB). |

**PDF validation:** Accepted if `Content-Type` is `application/pdf` **or** the uploaded filename ends with `.pdf` (case-insensitive).

#### Name matching algorithm (must mirror server expectations)

Server normalizes both the submitted string and each `profiles.name` with:

1. Trim leading/trailing whitespace.
2. Lowercase ASCII (locale-insensitive display-name match).
3. Collapse internal whitespace runs to a single space (`\s+` → one space).

Match is **exact equality** on normalized strings. Typos, nicknames, or partial names **do not** match.

---

### Success response

**HTTP 200** — JSON object:

```json
{
  "ok": true,
  "userId": "<uuid>",
  "email": "<profile email string>",
  "matchedName": "<profiles.name as stored>",
  "storagePath": "<userId>/insurance-card.pdf",
  "policyNumber": "<string or placeholder>",
  "effectiveDate": "<string or placeholder>",
  "vehicleName": "<string or placeholder>",
  "emailSent": true,
  "warning": "<optional; present when PDF saved but email path degraded>"
}
```

**Semantics:**

- Policy fields come from the **first** vehicle row for that user (`created_at` ascending). Missing DB values appear as `"—"` in the email body.
- `storagePath` is relative to bucket `insurance-cards`.
- If Resend is not configured or profile has no email, **`emailSent`** is **`false`** and **`warning`** explains why; **`ok`** remains **`true`** if upload + DB update succeeded.

---

### Error responses

All errors return JSON with at least `{ "ok": false, "error": "<message>" }` unless noted.

| HTTP | Condition | Extra JSON fields |
|------|-----------|-------------------|
| 400 | Not `multipart/form-data` / parse failure | — |
| 400 | Missing `fullName` / `name` | — |
| 400 | Missing or empty `file` | — |
| 400 | Not a PDF | — |
| 400 | PDF larger than 5 MiB | — |
| 401 | Invalid or missing secret | — |
| 404 | No profile matches normalized name | `hint` |
| 409 | More than one profile matches | `matchedIds`: string[] |
| 500 | Database error during lookup or profile update | — |
| 502 | Supabase Storage upload failed | `error` includes message |
| 503 | `TELEGRAM_INTEGRATION_SECRET` not set on server | — |
| 503 | Supabase URL / `SUPABASE_SERVICE_ROLE_KEY` missing | — |

---

## GET: health check

Same auth headers as POST.

**HTTP 200** example:

```json
{
  "ok": true,
  "service": "telegram-integration",
  "postFields": ["fullName | name", "file (PDF)"],
  "auth": "Authorization: Bearer <TELEGRAM_INTEGRATION_SECRET>"
}
```

**HTTP 401** if secret is wrong or absent.

---

## Implementation snippets

### cURL (POST)

```bash
curl -sS -X POST "${ORIGIN}/api/integrations/telegram" \
  -H "Authorization: Bearer ${TELEGRAM_INTEGRATION_SECRET}" \
  -F "fullName=John Doe" \
  -F "file=@/path/to/card.pdf;type=application/pdf"
```

### Node.js (fetch + FormData)

```javascript
const form = new FormData();
form.append("fullName", "John Doe");
form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), "card.pdf");

const res = await fetch(`${ORIGIN}/api/integrations/telegram`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.TELEGRAM_INTEGRATION_SECRET}` },
  body: form,
});

const data = await res.json();
if (!res.ok) throw new Error(data.error ?? res.statusText);
```

### Python (requests)

```python
import os, requests
r = requests.post(
    f"{ORIGIN}/api/integrations/telegram",
    headers={"Authorization": f"Bearer {os.environ['TELEGRAM_INTEGRATION_SECRET']}"},
    files={"file": ("card.pdf", open("card.pdf", "rb"), "application/pdf")},
    data={"fullName": "John Doe"},
)
r.raise_for_status()
print(r.json())
```

---

## Server-side prerequisites (deployer, not the bot)

These are **not** sent by the bot; they must exist on the Next.js host:

- `TELEGRAM_INTEGRATION_SECRET` or `TELEGRAM_BOT_API_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` + Supabase project URL (see `getSupabaseProjectUrl()` / env in repo)
- For email: `RESEND_API_KEY`, `RESEND_FROM`, and a non-empty `profiles.email` on the matched user

---

## Source of truth (code)

| Concern | Location |
|---------|----------|
| Route handler | `app/api/integrations/telegram/route.ts` |
| Name normalization / lookup | `lib/integrations/find-client-by-display-name.ts` |
| Email template | `lib/email/policy-issued-template.ts` (`buildPolicyIssuedEmail`) |

---

## AI agent checklist

When implementing a Telegram bot caller:

1. Use **POST** + **multipart/form-data** with fields `fullName` (or `name`) and `file`.
2. Send **`Authorization: Bearer …`** (or one of the alternate headers).
3. Expect **`ok: true`** only for HTTP 200; always parse JSON and check **`emailSent`** if you must confirm delivery.
4. Handle **409** by manual deduplication of clients or adjusting `profiles.name` in the database.
5. Never assume JSON request bodies work for **POST** on this path.
