# Insurance Card Generator — Replication Prompt

Paste the prompt below into your AI coding agent **after** giving it access to this entire `insurance-card-reference/` folder.

---

## Prompt

You are replicating an existing, working **NY FS-20 auto-insurance ID card generator** into a new Next.js 16 / React 19 / TypeScript project.

I have attached the reference repo subset under `insurance-card-reference/`. **Read every file under `lib/pdf/`, `lib/vin/`, `lib/email/`, `lib/purchase/`, `lib/stripe/`, `lib/site-url.ts`, `app/api/purchase/`, `app/api/stripe/`, `app/api/vin/`, `app/purchase/`, `app/qwertyuiop/`, and `components/BrandMark.tsx` before writing any code.** Also read `Policy #_ 2035252790.pdf` — that is the pixel-exact visual the FS-20 layout was reverse-engineered from.

Then recreate every file at **the same path** in the target project, preserving:

- Exact byte values for AAMVA separators: `\x0A` LF (data element), `\x1E` RS (header byte 3), `\x0D` CR (segment terminator).
- Exact element order in the ID subfile: `DCS, DAC, DAD, DBD, DBB, DBA, DBC, DAY, DAU, DAG, [DAH], DAI, DAJ, DAK, DAQ, DCF, DCG, DDE, DDF, DDG, VAD`.
- **DAQ is the AAMVA customer / document ID, NOT the policy number.** Policy goes in `ZNA` and `DCF`. Empty/invalid DAQ defaults to `000000000` via `normalizeAamvaDaq`.
- All hard-coded coordinates in `lib/pdf/ny-insurance-id-card.ts` (page 612×792 pt, `CARD_TOP_1=777.6`, `CARD_PITCH=264.24`, `BARCODE_X=18.03`, `FAX_BARCODE_X=1.47`, etc.) — do **not** "round" or "clean up".
- Barcode rendering: 10 columns / scale 2 for the card barcode, 12 columns / scale 3 for the FAX barcode, `eclevel: 4` for both.
- `export const runtime = 'nodejs'` on every API route that touches `bwip-js`, `pdf-lib`, or `resend`.
- Email template wording in `lib/email/purchase-welcome.ts` exactly (ASCII apostrophes, em dash `—` in vehicle line, `Buffer.from(pdfBytes)` for the attachment, filename `insurance-id-card-${policyNumber}.pdf`).
- `/qwertyuiop/success/page.tsx` reuses `PurchaseSuccessClient` with `backHref="/qwertyuiop"` — do **not** duplicate the component.
- `PurchaseSuccessClient` includes the **DAQ** input (default `'000000000'`) and sends `daq: daq.trim() || undefined` in the `POST /api/purchase/complete` body.
- `app/api/purchase/complete/route.ts` calls `normalizeAamvaDaq(b.daq)` and passes the result as `daq` to `buildNyInsuranceIdCardPdf`.

Install dependencies from the attached `package.json`. Required runtime deps for this slice:

```
next@16, react@19, react-dom@19, typescript@5,
pdf-lib@^1.17.1, bwip-js@^4.10.1,
stripe@^22.1.1, resend@^6, zod@^3, date-fns@^4
```

## Acceptance criteria

1. `npx tsc --noEmit` is clean.
2. With `STRIPE_SECRET_KEY` (or `TEST_PURCHASE_SIGNING_SECRET`) and `RESEND_API_KEY` + `RESEND_FROM` set, `POST /api/purchase/test-checkout` with `{ "planKey": "1m" }` returns a `/qwertyuiop/success?token=...` URL.
3. Submitting that page's form (e.g. VIN `3N1AB8CV2MY298179`, DAQ blank) returns HTTP 200 and Resend delivers an email with `insurance-id-card-ATP*.pdf` attached.
4. The PDF has **two** stacked NY FS-20 ID cards plus a FAX scannable PDF417 barcode at the bottom.
5. Decoding any of the PDF417 symbols yields an AAMVA stream containing **`DAQ000000000`** (or the supplied DAQ) **and** **`ZNA<policyNumber>`** — never `DAQ<policyNumber>`.
6. `/purchase` flow with a real Stripe test card produces the same end state.

## Hard rules — do not violate

- Do **not** invent fields.
- Do **not** change AAMVA separator bytes.
- Do **not** move coordinates.
- Do **not** swap `pdf-lib` for another library.
- Do **not** put the policy number in `DAQ`.
- Do **not** drop `runtime = 'nodejs'` from API routes.
- Do **not** convert the email body to HTML — keep plain text + PDF attachment.

Match the source 1:1.

---

## What's in this folder

```
insurance-card-reference/
├─ PROMPT.md                                ← this file
├─ package.json                             ← exact dep versions to install
├─ Policy #_ 2035252790.pdf                 ← visual reference for FS-20 layout
├─ app/
│  ├─ purchase/
│  │  ├─ page.tsx                           ← live (Stripe) plan picker
│  │  └─ success/
│  │     ├─ page.tsx                        ← Suspense wrapper
│  │     └─ PurchaseSuccessClient.tsx       ← shared intake form (DAQ + VIN + ...)
│  ├─ qwertyuiop/
│  │  ├─ page.tsx                           ← dummy plan picker
│  │  └─ success/page.tsx                   ← reuses PurchaseSuccessClient
│  └─ api/
│     ├─ purchase/
│     │  ├─ complete/route.ts               ← builds PDF + emails it
│     │  ├─ session/route.ts                ← verifies Stripe / test session
│     │  └─ test-checkout/route.ts          ← creates HMAC test token
│     ├─ stripe/checkout/route.ts           ← creates Stripe Checkout session
│     └─ vin/decode/route.ts                ← NHTSA passthrough
├─ lib/
│  ├─ pdf/
│  │  ├─ aamva-pdf417-insurance.ts          ← AAMVA Annex D payload (DAQ here)
│  │  ├─ pdf417-render.ts                   ← bwip-js → PNG
│  │  └─ ny-insurance-id-card.ts            ← FS-20 page layout + assembly
│  ├─ vin/decode-vin.ts                     ← NHTSA vPIC fetch + normalize
│  ├─ email/
│  │  ├─ resend.ts                          ← Resend client wrapper
│  │  ├─ purchase-welcome.ts                ← post-payment email template
│  │  └─ policy-issued-template.ts          ← admin-issued variant
│  ├─ purchase/
│  │  ├─ plans.ts                           ← plan catalog + helpers
│  │  └─ test-checkout-token.ts             ← HMAC sign / verify
│  ├─ stripe/server.ts                      ← Stripe singleton
│  └─ site-url.ts                           ← request-aware base URL
└─ components/BrandMark.tsx                 ← brand mark used by purchase pages
```

## Required environment variables

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
TEST_PURCHASE_SIGNING_SECRET=any-strong-secret   # optional, falls back to STRIPE_SECRET_KEY
RESEND_API_KEY=re_...
RESEND_FROM="Tri State Coverage <no-reply@yourverifieddomain.com>"
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```
