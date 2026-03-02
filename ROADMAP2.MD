# Site Structure Blueprint — TriStateTags (Template)

This document captures the **exact structure** of the TriStateTags temporary vehicle tag e-commerce site. Use it as a spec to replicate or as input for AI agents building competitors/iterations.

---

## Tech Stack
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router, Lucide icons
- **Backend:** Node.js, Express
- **Database:** Supabase (PostgreSQL) or JSON file fallback
- **Payments:** Stripe Checkout (server-side verification)
- **Notifications:** Telegram bot
- **Deploy:** Render (full-stack) or Render + Vercel (split)

---

## Page Structure & Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Index | Landing + services grid |
| `/checkout/:serviceId` | Checkout | Form + Stripe redirect |
| `/checkout/success` | CheckoutSuccess | Payment verification + confirmation |
| `/admin` | Admin (with AdminLogin) | Dashboard, orders, services, analytics |
| `/terms` | Terms | Terms of Service |
| `/privacy` | Privacy | Privacy Policy |
| `*` | NotFound | 404 page |

---

## Landing Page Sections (in order)
1. **Header** — Sticky, transparent bg, logo + trust badges + nav + CTA "BUY IT NOW"
2. **Trust bar** — Full-width strip, icons + text (Licensed Dealer, MVC, DMV Verified, etc.)
3. **Hero** — Dark bg, headline, subheadline, dual CTAs (BUY IT NOW, GET MY TEMP TAG), trust checkmarks
4. **Benefits grid** — 6 cards (icon + title + desc), CTA below
5. **Delivery options** — 2 cards (Email, 1-Hour Car Delivery)
6. **Stats** — 3 metric blocks (e.g. 10,000+ Tags, 1-2 hrs, 7 Days)
7. **How It Works** — 3 steps with numbered circles
8. **Testimonials** — 3 quote cards with star ratings
9. **Pricing section** — Single $150 card, includes list, BUY IT NOW
10. **Services grid** — Dynamic ServiceCards from API
11. **FAQ** — Accordion, 5 questions
12. **Final CTA** — Full-width strip, headline + dual CTAs
13. **Footer** — 4 columns (Brand, Company, Legal, Support), copyright, disclaimer

---

## Checkout Flow
1. User selects service → `/checkout/:serviceId`
2. Form: firstName, lastName, phone, address, deliveryAddress, vin, carMakeModel, color
3. Submit → POST `/api/checkout/create-session` → Redirect to Stripe
4. Stripe → success_url `/checkout/success?session_id=xxx`
5. Success page → GET `/api/checkout/verify?session_id=xxx` (server verifies `payment_status === 'paid'`)
6. Only then: order created, Telegram sent, success UI shown

---

## Admin Structure
- **Auth:** Password + JWT, no public admin link
- **Views:** Analytics (default), Orders, Services
- **Analytics:** Stats (orders count, total payments, data stored), activity lists, Telegram status
- **Orders:** Table (ID, customer, vehicle, price, date, Telegram status)
- **Services:** CRUD — add service (title, description, price, image), delete

---

## API Endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | — | Health check |
| GET | `/api/services` | — | List services |
| POST | `/api/checkout/create-session` | — | Create Stripe session, return URL |
| GET | `/api/checkout/verify?session_id=` | — | Verify payment, create order |
| POST | `/api/auth/login` | — | Admin login, return JWT |
| GET | `/api/admin/orders` | Bearer | List orders |
| GET | `/api/admin/services` | Bearer | List services |
| POST | `/api/admin/services` | Bearer | Add service |
| DELETE | `/api/admin/services/:id` | Bearer | Delete service |
| GET | `/api/admin/stats` | Bearer | Analytics data |

---

## Database Schema (Supabase)
- **services:** id, title, description, price, image, created_at
- **orders:** id, service_id, service_title, first_name, last_name, phone, address, delivery_address, vin, car_make_model, color, price, created_at, telegram_sent, telegram_recipients, telegram_errors, stripe_session_id, payment_status
- **activity:** id, type, payload (JSONB), created_at

---

## Component Hierarchy
- `App` → `BrowserRouter` → Routes
- `Header` (used on Index, Checkout, CheckoutSuccess, Terms, Privacy, NotFound)
- `ServiceCard` — service image, title, desc, price, BUY IT NOW button
- `AdminLogin` — password form, car icon, submit → JWT in localStorage
- shadcn/ui: Card, Button, Input, Label, Table, Badge, Accordion, etc.

---

## Design Tokens (Tailwind / index.css)
- Primary: teal (172 66% 38%)
- Font: DM Sans (body), Outfit (display/headings)
- Radius: 0.75rem
- Transitions: smooth, 2500ms+ for animations

---

## Funnel Psychology Applied
- Urgency: Same day
- Trust: Licensed dealer, MVC, DMV verified
- Proof: Testimonials with stars
- Simplicity: 3-step process
- Speed: Instant email or 1-hour delivery
- CTA placement: Header, Hero, Benefits, Testimonials, Pricing, Final section
