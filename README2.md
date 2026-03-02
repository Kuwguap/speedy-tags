# [Product Name] — [Tagline]

[One-line description: e.g. Full-stack e-commerce for temporary vehicle tags. Admin panel, Stripe, Telegram, Supabase.]

## Features
- **Storefront:** Browse services, Stripe checkout, [key form fields]
- **Admin:** Password-protected at `/admin`, analytics, [integrations]
- **[Integration 1]:** [e.g. Telegram — Orders sent to bot]
- **Database:** Supabase (PostgreSQL) or JSON file fallback

---

## Deploy in One Click: Render Blueprint

1. **Push to GitHub** (if not already)

2. **Create Supabase project** at [supabase.com](https://supabase.com):
   - New project → Get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Settings → API
   - **SQL Editor → New Query → paste & run** the entire contents of `supabase/setup.sql`

3. **Deploy on Render:**
   - [render.com](https://render.com) → New → Blueprint
   - Connect your GitHub repo
   - Add env vars in Render dashboard:
     - `ADMIN_PASSWORD`
     - `STRIPE_SECRET_KEY`
     - `APP_URL` (your public URL)
     - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` (if used)
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Deploy

4. **Result:** One Web Service serving frontend + API.

---

## Optional: Frontend on Vercel

1. Deploy backend on Render first
2. Vercel: `VITE_API_URL` = your Render URL (no trailing slash)
3. Redeploy Vercel

---

## Local Development

```bash
cp .env.example .env
# Edit .env with required vars

npm install
npm run dev:all    # Frontend (8080) + Backend (3001)
```

- Site: http://localhost:8080
- Admin: http://localhost:8080/admin

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `APP_URL` | Yes (prod) | Public URL for redirects |
| `JWT_SECRET` | Yes (prod) | Session signing secret |
| `SUPABASE_URL` | For DB | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For DB | Service role key |
| `VITE_API_URL` | Vercel only | Backend URL |

---

## Project Structure (Reference)
- `src/pages/` — Index, Checkout, CheckoutSuccess, Admin, AdminLogin, Terms, Privacy, NotFound
- `src/components/` — Header, ServiceCard, NavLink, ui/
- `src/lib/` — api.ts, store.ts, utils.ts
- `server/` — index.js (Express), db.js (Supabase client)
- `supabase/setup.sql` — Tables + seed

---

# AI Agent Prompt: Build a Modern Competitor

Copy the prompt below and give it to an AI coding agent (Cursor, Copilot, Claude, etc.) to create a **better-looking, modern competitor** to this site.

---

```
Build a modern, visually stunning competitor to the TriStateTags temporary vehicle tag e-commerce site. Use the structure in ROADMAP2.MD and README2.md as your blueprint, but create a distinctly superior design and UX.

## Requirements

**Keep the same functional structure:**
- Landing page with: header, trust bar, hero, benefits, delivery options, how it works, testimonials, pricing, services grid, FAQ, final CTA, footer
- Checkout flow: form → Stripe → success (with server-side payment verification)
- Admin: password auth, orders table, services CRUD, analytics
- Tech: React + Vite + TypeScript + Tailwind + Express + Supabase + Stripe

**Improve design and modernize:**
1. **Visual identity:** Pick a fresh, distinctive aesthetic—avoid generic "AI slop." Consider:
   - Bold typography (e.g. Clash Display, Satoshi, Syne, or a strong serif)
   - Unique color palette (not default teal/purple gradients)
   - Strong use of whitespace, asymmetry, or editorial layout
   - Subtle motion: micro-interactions, staggered reveals, parallax on scroll

2. **Hero section:** Make it memorable—large typography, compelling imagery or abstract visuals, clear value prop.

3. **Trust & conversion:** 
   - Redesign trust badges and benefits to feel premium, not generic
   - Testimonials: add avatars, better layout, possibly a carousel
   - FAQ: smooth accordion with better visual hierarchy
   - CTAs: distinctive button style, clear hierarchy

4. **Mobile-first:** Ensure everything feels native and polished on mobile—touch targets, spacing, sticky CTAs.

5. **Performance:** Optimize images, lazy-load below fold, minimal JS.

## Output
- A complete, runnable codebase in the same folder structure (src/, server/, supabase/)
- Updated ROADMAP2.MD and README2.md if you add/change features
- A design-system summary (colors, fonts, spacing) in a short DESIGN.md

Do NOT just restyle with minor tweaks. Create something that would make a user choose this site over the original on visual appeal and UX alone.
```
