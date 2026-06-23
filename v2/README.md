# TriStateTags v2

A clean, minimal rebuild of TriStateTags as a pure **email-delivery** service.

- **No background music**, no external bots, no krab-dispatch-api.
- **Paystack** for payments (site displays `$`).
- **Email-only delivery** — no shipping, no driver.
- Single Express server with local JSON storage, optional Resend for receipts.
- React + Vite + Tailwind front-end, designed with the `ui-ux-pro-max` palette
  (vibrant blue + orange CTA, Rubik / Nunito Sans).

## Project layout

```
v2/
├── server/         Express API (Paystack init + verify + admin)
├── src/            React + Vite + Tailwind front-end
├── public/         Static assets
├── data/           Created at runtime — local orders.json (gitignored)
├── .env.example    Copy to .env
└── package.json
```

## Get started

```bash
cd v2
npm install
cp .env.example .env     # then fill in PAYSTACK_* and ADMIN_PASSWORD
npm run dev              # runs Vite (5173) + API (3001) together
```

Open <http://localhost:5173>.

| URL                                  | Purpose                                |
| ------------------------------------ | -------------------------------------- |
| `/`                                  | Landing page                           |
| `/checkout`                          | Email-only checkout (Paystack popup)   |
| `/success?reference=...`             | Auto-verifies payment, shows receipt   |
| `/admin`                             | Password-gated orders dashboard        |

## Required env vars

| Var                       | Required | Notes                                                            |
| ------------------------- | -------- | ---------------------------------------------------------------- |
| `ADMIN_PASSWORD`          | Yes      | Used to sign into `/admin` and as the API admin bearer.          |
| `PAYSTACK_SECRET_KEY`     | Yes      | Server-side calls to Paystack.                                   |
| `PAYSTACK_PUBLIC_KEY`     | Yes      | Sent to the browser for the inline popup.                        |
| `PAYSTACK_CURRENCY`       | Yes      | Must match an enabled currency on your Paystack account.         |
| `APP_URL`                 | Optional | Public URL of the front-end. Used as the Paystack callback URL.  |
| `TAG_PRICE`               | Optional | Defaults to `150`. Major units. Site always displays `$`.        |
| `RESEND_API_KEY`          | Optional | If set, a receipt email is sent on successful payment.           |
| `RESEND_FROM_EMAIL`       | Optional | From header for receipts, e.g. `"TriStateTags <orders@you.com>"` |

## Production

```bash
cd v2
npm install
npm run build
npm start                 # starts the API on $PORT (default 3001)
```

Serve `dist/` from any static host (Vercel, Netlify, Cloudflare Pages) and
point `APP_URL` at it. The API only needs to live wherever the front-end can
reach `/api/*` (proxy or rewrite).

## Why no Stripe / no music / no dispatch?

This rebuild was scoped to the bare minimum the business actually needs:

1. Customer pays.
2. Order shows up in the admin dashboard.
3. Admin emails them the tag and clicks **Mark fulfilled**.

Everything else from v1 (Friday Payday, Telegram bots, Krab dispatch, driver
delivery flow, background music, multi-step tag-info collection) was removed
on purpose — it stays in the parent repo if you ever need to bring it back.
