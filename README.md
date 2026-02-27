# QuickTags — Temporary Car Tags

Full-stack e-commerce for temporary vehicle tags. Admin panel, Telegram notifications, Supabase or file storage.

## Features
- **Storefront:** Browse services, checkout with vehicle/personal info
- **Admin:** Password-protected at `/admin`, analytics, Telegram delivery status
- **Telegram:** Orders sent to bot (group, user, or multiple recipients)
- **Database:** Supabase (PostgreSQL) or JSON file fallback

---

## Deploy in One Click: Render Blueprint

1. **Push to GitHub** (if not already)

2. **Create Supabase project** at [supabase.com](https://supabase.com):
   - New project → Get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Settings → API
   - SQL Editor → run the contents of `supabase/migrations/20240227000000_init.sql`

3. **Deploy on Render:**
   - [render.com](https://render.com) → New → Blueprint
   - Connect your GitHub repo
   - Render reads `render.yaml` automatically
   - Add env vars in Render dashboard:
     - `ADMIN_PASSWORD` — your admin password
     - `TELEGRAM_BOT_TOKEN` — from @BotFather
     - `TELEGRAM_CHAT_IDS` — comma-separated (e.g. `-1001234567890`)
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - Deploy

4. **Result:** One service at `https://quicktags-xxx.onrender.com` — frontend + API + Telegram.

---

## Optional: Frontend on Vercel

If you want the frontend on Vercel and backend on Render:

1. Deploy backend to Render first (see above)
2. In Vercel: Import repo → set **Environment Variable** `VITE_API_URL` = `https://your-app.onrender.com`
3. Deploy. Vercel will build the frontend; API calls go to Render.

---

## Local Development

```bash
cp .env.example .env
# Edit .env with ADMIN_PASSWORD, optional Telegram & Supabase

npm install
npm run dev:all    # Frontend (8080) + Backend (3001)
```

- Site: http://localhost:8080
- Admin: http://localhost:8080/admin

---

## Environment Variables

| Variable | Required | Description |
|---------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `JWT_SECRET` | Yes (prod) | Session signing secret |
| `TELEGRAM_BOT_TOKEN` | For Telegram | From @BotFather |
| `TELEGRAM_CHAT_IDS` | For Telegram | Comma-separated chat IDs |
| `SUPABASE_URL` | For DB | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For DB | Service role key |
| `VITE_API_URL` | Vercel only | Backend URL (e.g. Render) |
