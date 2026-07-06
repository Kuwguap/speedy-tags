# Speedy System — tags + insurance + dispatch

A 4-part system sharing one Supabase database:

| # | App | Host | Status |
|---|-----|------|--------|
| 1 | `apps/tag-site` | Vercel | **Phase 1 ✅** — buy a temp tag (Stripe), "NJ Temporary Tag" |
| 2 | `apps/dispatch-bot` | Render | **Phase 1 ✅** — Telegram dispatch to supervisors + drivers |
| 3 | `apps/insurance-site` | Vercel | **Phase 2 ✅** — "NJ Coverage" portal (Next.js), unified Supabase + transactions ledger |
| 4 | `apps/central-bot` | Render | Phase 2 (remaining) — dashboard + 28-day renewals + driver mgmt |

Shared code lives in `packages/shared` (PDF generation, Supabase, SendGrid, OpenAI, plate allocation, types).

## The Phase 1 flow

```
Buyer → tag-site (Stripe Checkout)
      → order saved to Supabase (status=paid)
      → tag-site pushes { orderId } to dispatch-bot /leads
      → dispatch-bot generates the NJ/non-NJ tag PDF (shared pipeline)
          ├─ sends the FULL PDF to every supervisor (informational)
          └─ sends Accept/Decline to every driver
      → first driver to Accept wins (atomic)
          ├─ delivery row created
          ├─ driver gets PDF + full details in Telegram + by email (SendGrid)
          └─ customer gets their tag by email
      → driver sends a photo of the signed receipt → delivery marked delivered
```

The dispatch bot also has an **AI-agent chat mode**: a supervisor pastes a lead
(or forwards a document); OpenAI extracts the fields, the bot generates the
plate, previews it, and asks **Send to all drivers** or **Pick a driver**.

## Prerequisites

- **pnpm** (`corepack enable && corepack prepare pnpm@9 --activate`)
- A **Supabase** project, a **Stripe** account, a **SendGrid** sender, an
  **OpenAI** key, and a **Telegram bot** (via @BotFather).

## Setup

```bash
cd system
pnpm install

# 1. Database — run the migration + seed in the Supabase SQL editor
#    (or `supabase db push` if using the CLI):
#    supabase/migrations/0001_init_tags_dispatch.sql
#    supabase/seed.sql   ← edit driver/supervisor telegram ids first

# 2. Env — copy and fill:
cp .env.example .env      # shared values
# each app reads process.env; on Vercel/Render set them in the dashboard.
```

### Fonts

The tag PDF renders best with Arial. Drop `ARIALBD.TTF` / `ARIAL.TTF` (or the
free Liberation Sans equivalents) into `packages/shared/pdf/fonts/`. Without
them it falls back to Helvetica. See that folder's README.

## Run locally

```bash
# Dispatch bot (needs a public URL for Telegram — use a tunnel like ngrok
# and set DISPATCH_PUBLIC_URL, or run the bot on Render and test there):
pnpm --filter @speedy/dispatch-bot dev

# Tag site — use `vercel dev` so the /api functions run:
cd apps/tag-site && vercel dev
```

## Deploy

- **Vercel** (tag-site): New Project → Root Directory `apps/tag-site`. Vercel
  detects pnpm + the workspace. Add all env vars. Set the Stripe webhook to
  `https://<domain>/api/stripe/webhook`.
- **Render** (dispatch-bot): New Web Service → Root Directory `apps/dispatch-bot`
  (see `render.yaml`). Build `corepack enable && pnpm install`, start `pnpm start`.
  Set `DISPATCH_PUBLIC_URL` to the Render URL; the bot registers its Telegram
  webhook on boot (or run `pnpm --filter @speedy/dispatch-bot set-webhook`).

## Verification checklist (Phase 1)

1. Migrations applied; `orders`, `drivers`, `supervisors`, `deliveries`,
   `transactions`, `settings` exist. Seed 1 supervisor + 2 drivers.
2. Buy a tag as an **NJ** buyer, then a **non-NJ** buyer (Stripe test mode).
   Confirm two distinct PDFs (NJ.pdf vs NONNJ.pdf templates).
3. Supervisors receive the full PDF; both drivers receive Accept/Decline.
4. Accept as driver A → B's message flips to "Claimed", a `deliveries` row is
   `accepted`, A gets the PDF by email + details in Telegram, customer emailed.
5. In chat, paste a raw lead → OpenAI parse → PDF → Send-to-all / Pick-a-driver.
6. Upload a receipt photo as a driver → `deliveries.receipt_path` set, delivered.
7. Every paid purchase wrote a `transactions` row.

## Insurance site (Phase 2, `apps/insurance-site`)

"NJ Coverage" — a Next.js 16 portal (ported from `../v2/b_H821T7ehlpo`,
rebranded). It shares the **same Supabase project** as the tag system: its
tables (`profiles`, `policies`, `invoices`, `vehicles`, `coverage`,
`app_feature_flags`) live alongside the tag/dispatch tables, so run **all**
migrations in `supabase/migrations/` (the `0001_*` tag schema plus the
`202604*` insurance schema — they don't collide). Every insurance payment is
written to the shared `transactions` ledger (`source='insurance'`) so the
future central dashboard sees tag + insurance payments in one place.

Deploy as a second Vercel project with Root Directory `apps/insurance-site`.
It has its own env (`apps/insurance-site/.env.example`) but reuses the shared
`SUPABASE_*`, `STRIPE_*`, and `OPENAI_*` values. Verified: `tsc --noEmit` clean.

## Notes / open items

- **Document authenticity**: this mints temporary plates + insurance cards from
  user data. Confirm it runs under an authorized dealer/DMV workflow before
  production.
- Agent-mode draft state is per-process; fine for a single Render instance.
- Remaining Phase 2: the central bot/dashboard (SendGrid 28-day renewals,
  unified transactions view, driver/supervisor management UI).
