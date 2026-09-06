# Fonts

The temp-tag PDF (`nj-temp-tag.js`) draws the big plate number, expiry banner,
and document ID in **Arial Bold**. On a Windows dev box it finds Arial in
`C:/Windows/Fonts`. On Render/Vercel Linux it will **not** — without a bundled
font it falls back to Helvetica, which shifts the hero text slightly.

To render identically everywhere, drop Arial-metric TTFs here:

```
ARIALBD.TTF   (or Arial-Bold.ttf)   ← bold, used for plate/expiry/doc-id
ARIAL.TTF     (or Arial.ttf)        ← regular, used for the small left-column plate
```

Arial is proprietary and is **git-ignored** (see repo `.gitignore`) — commit it
only if you're licensed to. A metric-compatible free alternative is
**Liberation Sans** (`LiberationSans-Bold.ttf` / `LiberationSans-Regular.ttf`),
which the loader also checks for at the standard Linux path.
