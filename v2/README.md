# Kingsman Tags

A premium-feel, self-contained rebuild of the NJ temporary-tag service.

- **Single Express server** — no external bots, no separate payment service.
- **Inbox-only delivery** — no shipping, no driver.
- **Accounts with magic-link auth** — created automatically at first payment.
- **Auto-renewal** — reminder emails every 28 days; one-tap renew at the same flat price.
- **Royal palette** — deep navy + gold, Bodoni Moda + Jost typography.
- **Animated UI** — gradient mesh, floating cards, fade-up stagger, shimmer CTAs.
  All animations honour `prefers-reduced-motion`.

## Project layout

```
v2/
├── server/         Express API (checkout init/verify, accounts, renewal cron)
├── src/            React + Vite + Tailwind front-end
├── public/         Static assets
├── data/           Created at runtime — users / orders / tokens JSON
├── .env.example    Copy to .env
└── package.json
```

## Get started

```bash
cd v2
npm install
cp .env.example .env     # fill in the secrets
npm run dev              # vite on 5173 + api on 3001 together
```

Open <http://localhost:5173>.

## Pages

| URL                                  | Purpose                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `/`                                  | Landing page                                                     |
| `/checkout`                          | Buy a tag — also auto-creates an account                         |
| `/success?reference=…`               | Verifies payment, shows receipt + "Manage renewals" CTA          |
| `/login`                             | Magic-link sign in (no passwords)                                |
| `/account[?token=…]`                 | Member dashboard — orders, renewal toggle, renew now             |
| `/renew?token=…`                     | Magic renewal landing — consumes token, redirects to `/account`  |
| `/admin`                             | Admin dashboard — orders + members + manual renewal reminders    |

## Required env vars

| Var                                | Required | Notes                                                            |
| ---------------------------------- | -------- | ---------------------------------------------------------------- |
| `ADMIN_PASSWORD`                   | Yes      | Used to sign into `/admin`.                                      |
| `PAYSTACK_SECRET_KEY`              | Yes      | Server-side payments.                                            |
| `PAYSTACK_PUBLIC_KEY`              | Yes      | Sent to the browser for the inline popup.                        |
| `PAYSTACK_CURRENCY`                | Yes      | Must match an enabled currency on your account.                  |
| `APP_URL`                          | Optional | Public URL of the front-end. Used for callback + email links.    |
| `TAG_PRICE`                        | Optional | Defaults to `150`. Site always displays `$`.                     |
| `RENEWAL_PERIOD_DAYS`              | Optional | Defaults to `28`.                                                |
| `RENEWAL_CHECK_INTERVAL_MINUTES`   | Optional | How often the renewal sweep runs. Default `60`.                  |
| `RESEND_API_KEY`                   | Optional | Required to actually send welcome / sign-in / renewal emails.    |
| `RESEND_FROM`                      | Optional | Internal — never echoed in the customer-facing UI.               |

## How accounts & renewals work

1. **Checkout** → server creates the user (`renewalEnabled: true` by default), then
   issues a session token returned to the browser. The user is logged in
   immediately.
2. After verify, a welcome email is sent with a permanent management link so
   the customer can manage their account from any device.
3. The server runs a renewal sweep every `RENEWAL_CHECK_INTERVAL_MINUTES`. For
   each user with `renewalEnabled: true` whose last paid order is more than
   `RENEWAL_PERIOD_DAYS` old (and who hasn't been reminded in the past 24h), a
   one-shot magic link is generated and emailed.
4. Clicking the link lands on `/renew?token=…`, which exchanges the magic
   token for a session and lands the user on `/account` where the **Renew now**
   button starts a fresh payment for the same price as the last order.
5. The admin can also trigger a reminder on demand via **Send reminder** in
   the Members tab — useful for testing or VIP follow-ups.

## Production

```bash
cd v2
npm install
npm run build
npm start                 # serves the API on $PORT (default 3001)
```

Host `dist/` on any static provider and point `APP_URL` at it.
