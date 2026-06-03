# Driver hiring funnel (`/interview`)

Built in **React** (Vite), Whimsical-inspired layout — not static HTML.

## Routes

| Path | Component |
|------|-----------|
| `/interview` | Landing |
| `/interview/requirements` | Requirements checklist |
| `/interview/apply` | Application form |
| `/interview/telegram` | Telegram setup |

Source: `src/pages/interview/`, layout `src/components/interview/InterviewLayout.tsx`, API `src/lib/interviewApi.ts`.

## API (Vercel)

`/api/interview/*` is handled by **`api/interview/[...path].js`** (serverless proxy). Vercel’s `api/` folder takes precedence over `vercel.json` rewrites — do not rely on rewrite-only proxying.

Set **`KRAB_INTERVIEWER_URL`** on Vercel (optional; defaults to `https://krab-interviewer-bot.onrender.com`).

Upstream **krab-interviewer-bot** must be a **Render web** service with `/api/health` returning `{ ok: true }`.

## Dev

```bash
npm run dev        # :8080 — Vite proxies /api/interview
npm run dev:all    # Vite + Express API :3001
```

## Legacy static kit

`driver-hiring-kit/` and `public/interview/` are deprecated; do not deploy static copies (they override the SPA on some hosts). Remove `public/interview/` if present before release.
