// Dynamic robots.txt so the Sitemap: directive points to the same host that
// served the request. Without this, GSC rejects the sitemap with
// "This URL is not allowed for a Sitemap at this location."

const ALLOWED_HOSTS = new Set([
  "tristatetag.com",
  "www.tristatetag.com",
  "tristatetags.com",
  "www.tristatetags.com",
]);

function resolveOrigin(req) {
  const forwarded = req.headers["x-forwarded-host"];
  const host = String(forwarded || req.headers.host || "").toLowerCase();
  const bare = host.split(",")[0].trim().split(":")[0];
  if (ALLOWED_HOSTS.has(bare)) return `https://${bare}`;
  return "https://tristatetags.com";
}

const DISALLOW = [
  "/admin",
  "/backend",
  "/checkout",
  "/checkout/",
  "/payment",
  "/payments",
  "/secure/",
  "/api/",
];

export default function handler(req, res) {
  const origin = resolveOrigin(req);
  const blocks = ["*", "Googlebot", "Bingbot"]
    .map(
      (ua) =>
        `User-agent: ${ua}\nAllow: /\n${DISALLOW.map((p) => `Disallow: ${p}`).join("\n")}`,
    )
    .join("\n\n");

  const body = `# ${origin}/robots.txt\n# Block private/transactional routes from search engines\n\n${blocks}\n\nUser-agent: Twitterbot\nAllow: /\n\nUser-agent: facebookexternalhit\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(200).send(body);
}
