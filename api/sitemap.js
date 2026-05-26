// Vercel serverless function that emits a sitemap matching the host that
// requested it. This lets both tristatetag.com and tristatetags.com serve a
// valid sitemap with self-referential URLs (Google Search Console rejects a
// sitemap whose URLs are on a different host than where the sitemap lives).

const PUBLIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
];

const ALLOWED_HOSTS = new Set([
  "tristatetag.com",
  "www.tristatetag.com",
  "tristatetags.com",
  "www.tristatetags.com",
]);

function resolveOrigin(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = String(forwarded || req.headers.host || "").toLowerCase();
  const clean = host.split(",")[0].trim();
  // Strip any port for safety, then pick the first allowed host or fall back to
  // the most-canonical plural domain.
  const bare = clean.split(":")[0];
  if (ALLOWED_HOSTS.has(bare)) return `https://${bare}`;
  return "https://tristatetags.com";
}

export default function handler(req, res) {
  const origin = resolveOrigin(req);
  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = PUBLIC_ROUTES.map(
    (r) =>
      `  <url>\n    <loc>${origin}${r.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(200).send(xml);
}
