# Create Client API — `POST /api/integrations/clients`

Server-to-server endpoint that creates a TriStateCoverage client account with
the same effect as the admin panel's "Add Client" form. Use this from a bot or
backend automation to provision a user and immediately surface an active
policy on their member dashboard.

> **Audience:** an AI / agent / backend service that already has the client
> data (name, vehicle, policy term, etc.) and a secret key. Do **not** call
> this from a browser — the API key is server-side only.

---

## 1. One-time server setup

1. Generate a long random secret (32+ bytes, e.g. `openssl rand -hex 32`).
2. Add it to your hosting environment as `INTEGRATIONS_API_KEY`:
   - **Vercel:** Settings → Environment Variables → add for all environments.
   - **Local dev:** put it in `.env.local`.
3. Make sure the existing service-role env vars are already present
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optionally
   `RESEND_API_KEY` + `RESEND_FROM` for the welcome email).
4. Redeploy. The endpoint is live at `https://<your-domain>/api/integrations/clients`.

To confirm:

```bash
curl -i https://your-domain.com/api/integrations/clients \
  -H "Authorization: Bearer $INTEGRATIONS_API_KEY"
# → 200 { "ok": true, "service": "integrations.clients", ... }
```

A `401` means the key is wrong; a `503` means the key isn't configured yet.

---

## 2. Authentication

Pick **one** of these headers (they're equivalent):

| Header                           | Example                                          |
| -------------------------------- | ------------------------------------------------ |
| `Authorization: Bearer <secret>` | `Authorization: Bearer 1f4c...c91a`              |
| `X-Api-Key: <secret>`            | `X-Api-Key: 1f4c...c91a`                         |
| `X-Integrations-Api-Key: <s>`    | `X-Integrations-Api-Key: 1f4c...c91a`            |

The secret is compared with `crypto.timingSafeEqual` — no timing leaks.

---

## 3. Request — `POST /api/integrations/clients`

`Content-Type: application/json`. All fields are validated server-side via
zod; rejected requests return `400` with a `issues` map.

### Required fields

| Field                  | Type      | Notes                                                                                          |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `email`                | string    | Must be unique. Becomes the user's sign-in email. Marked email-confirmed on creation.          |
| `password`             | string    | 7–200 chars. Bot must pass it on to the user out-of-band.                                      |
| `name`                 | string    | Display name on the dashboard + welcome email.                                                 |
| `phone`                | string    | 7–40 chars.                                                                                    |
| `vehicleName`          | string    | E.g. `"2015 Chrysler 200"`.                                                                    |
| `vin`                  | string    | 17 chars typical (accepts 11–20).                                                              |
| `policyNumber`         | string    | Unique per account.                                                                            |
| `policyEffectiveDate`  | string    | `YYYY-MM-DD`, `MM/DD/YYYY`, or `"April 11, 2026"`.                                             |
| `policyExpirationDate` | string    | Same formats. Term in months (rounded) drives the dashboard plan: 1 / 6 / 12 month.            |
| `annualPremium`        | number    | **Total** price for the policy term (matches admin "1/6/12 months from today" workflow).       |

### Optional fields

| Field                       | Type    | Default                  | Notes                                              |
| --------------------------- | ------- | ------------------------ | -------------------------------------------------- |
| `memberSince`               | string  | `""`                     | Free-form, e.g. `"May 2026"`.                      |
| `modelYear`                 | string  | `""`                     | Populated from VIN decode if you have it.          |
| `vehicleMake`               | string  | `""`                     |                                                    |
| `vehicleModel`              | string  | `""`                     |                                                    |
| `trimLevel`                 | string  | `""`                     |                                                    |
| `bodyClass`                 | string  | `""`                     |                                                    |
| `policyAddress`             | string  | `""`                     | Garaging / mailing address.                        |
| `liability`                 | boolean | `true`                   | Coverage toggles shown on the dashboard.           |
| `collision`                 | boolean | `true`                   |                                                    |
| `comprehensive`             | boolean | `true`                   |                                                    |
| `uninsuredMotorist`         | boolean | `false`                  |                                                    |
| `medicalPayments`           | boolean | `false`                  |                                                    |
| `roadsideAssistance`        | boolean | `false`                  |                                                    |
| `insuranceCardPdfBase64`    | string  | —                        | Optional. Base64 of an FS-20 PDF (or data-URL).    |
| `insuranceCardFilename`     | string  | `"insurance-card.pdf"`   | Filename to store the PDF under.                   |

### Example request

```bash
curl -X POST https://your-domain.com/api/integrations/clients \
  -H "Authorization: Bearer $INTEGRATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "miguel.bustamante@example.com",
    "password": "ChangeMe-9b3c-77d1",
    "name": "Miguel Bustamante",
    "phone": "+1 718 555 0148",
    "memberSince": "May 2026",

    "vehicleName": "2015 Chrysler 200",
    "vin": "2C3CCAAG4FH815512",
    "modelYear": "2015",
    "vehicleMake": "Chrysler",
    "vehicleModel": "200",

    "policyNumber": "ATP4047221-00",
    "policyEffectiveDate": "2026-04-11",
    "policyExpirationDate": "2026-07-08",
    "policyAddress": "1105 Stadium Ave, Bronx, NY 10465",
    "annualPremium": 500,

    "liability": true,
    "collision": true,
    "comprehensive": true,
    "uninsuredMotorist": false,
    "medicalPayments": false,
    "roadsideAssistance": false
  }'
```

### Example response (`200 OK`)

```json
{
  "ok": true,
  "email": "miguel.bustamante@example.com",
  "policyNumber": "ATP4047221-00",
  "insuranceCardStored": false
}
```

If you also sent a PDF, `insuranceCardStored: true` and the welcome email
will arrive with the PDF attached.

---

## 4. Errors

| Status | When                                          | Body                                                                |
| ------ | --------------------------------------------- | ------------------------------------------------------------------- |
| `400`  | Bad JSON or zod validation failure            | `{ ok:false, error:"Validation failed", issues:{...} }`             |
| `400`  | Decoded base64 isn't a valid PDF              | `{ ok:false, error:"Decoded payload does not start with %PDF…" }`   |
| `401`  | Missing / wrong secret                        | `{ ok:false, error:"Unauthorized — pass the secret in …" }`         |
| `503`  | Server missing `INTEGRATIONS_API_KEY` or       | `{ ok:false, error:"... is not configured on the server. ..." }`    |
|        | `SUPABASE_SERVICE_ROLE_KEY`                   |                                                                     |

### Duplicate emails no longer error

If the `email` in the request already belongs to an existing customer, the
endpoint now **adds a second vehicle + policy** to that account instead of
returning `409`. The response is `200 { ok: true, added: "vehicle", userId,
vehicleId, policyId, ... }`. The customer's password, profile, coverage flags,
and existing vehicles are left untouched. The optional insurance card PDF, when
supplied, is stored at `{userId}/vehicle-{vehicleId}.pdf` so each policy has
its own downloadable card in the member dashboard.

Treat all 5xx as **retryable**, all 4xx as **not retryable** without changing
the payload.

---

## 5. Step-by-step for an AI coder integrating this

1. **Add the secret.** Set `INTEGRATIONS_API_KEY` in the TriStateCoverage
   project's hosting env. Store the same value securely in your bot/system
   (env var, secret manager — never check it into source).
2. **Health-check on startup.** `GET /api/integrations/clients` with the
   bearer token. Expect `200`. If you get `503`, the server still doesn't have
   the secret. If you get `401`, your secret value doesn't match.
3. **Collect the client data.** Mandatory: `email`, `password`, `name`,
   `phone`, `vehicleName`, `vin`, `policyNumber`, `policyEffectiveDate`,
   `policyExpirationDate`, `annualPremium`. Coverage flags default to
   liability/collision/comprehensive on; pass others as needed.
4. **(Optional) Encode the insurance card PDF** as base64 and put it in
   `insuranceCardPdfBase64`. Strip the leading `data:application/pdf;base64,`
   prefix or leave it — both work.
5. **POST as JSON** with the bearer token. Read `result.ok`.
   - `result.ok === true` and no `added` field: brand-new account was created.
   - `result.ok === true` and `added === "vehicle"`: email already had an
     account, so a second vehicle + policy were added instead. The password in
     the request is **ignored** — the customer keeps their existing login.
   - `result.ok === false`: surface `result.error`.
6. **Hand the password to the user out-of-band.** This endpoint never emails
   the password — that's deliberate. Send it via your own bot channel,
   ask them to change it on first login.
7. **(Optional) Verify the dashboard renders correctly** by signing in as the
   user once with the credentials you generated; you should see the policy
   number, dates, monthly premium, and (if uploaded) the insurance card PDF.

---

## 6. Pseudocode the AI coder can paste

### Node / TypeScript

```ts
async function createClient (input: CreateClientApiBody): Promise<void> {
  const r = await fetch('https://your-domain.com/api/integrations/clients', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.INTEGRATIONS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  const j = await r.json()
  if (!r.ok || !j.ok) {
    throw new Error(`Create client failed (${r.status}): ${j.error ?? 'unknown'}`)
  }
}
```

### Python

```python
import os, requests

def create_client(payload: dict) -> dict:
    r = requests.post(
        "https://your-domain.com/api/integrations/clients",
        headers={
            "Authorization": f"Bearer {os.environ['INTEGRATIONS_API_KEY']}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    body = r.json()
    if r.status_code >= 400 or not body.get("ok"):
        raise RuntimeError(f"Create client failed ({r.status_code}): {body.get('error')}")
    return body
```

### Attaching a PDF in either language

Read the PDF, base64-encode the bytes, set `insuranceCardPdfBase64`:

```ts
const pdfB64 = (await fs.readFile('./card.pdf')).toString('base64')
input.insuranceCardPdfBase64 = pdfB64
input.insuranceCardFilename = 'card.pdf'
```

```python
with open("card.pdf", "rb") as f:
    payload["insuranceCardPdfBase64"] = base64.b64encode(f.read()).decode()
    payload["insuranceCardFilename"] = "card.pdf"
```

That's everything needed to integrate.
