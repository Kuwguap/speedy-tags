/** Shared proxy to krab-tag-bot for /api/tag/* routes.
 *
 * The browser must never hold TAG_API_KEY. This same-origin Vercel function
 * injects `Authorization: Bearer <TAG_API_KEY>` and forwards to the tag bot,
 * streaming the PDF (or JSON) response straight back.
 */
export const UPSTREAM = (
  process.env.TAG_GENERATE_URL || "https://krab-tag-bot.onrender.com"
).replace(/\/+$/, "");

export const proxyConfig = {
  api: {
    bodyParser: false,
  },
};

function hopByHop(name) {
  const n = name.toLowerCase();
  return n === "host" || n === "connection" || n === "content-length" || n === "transfer-encoding";
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function proxyToTagUpstream(req, res, subpath) {
  const path = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${UPSTREAM}/api/tag${path ? `/${path}` : ""}${qs}`;

  const apiKey = (process.env.TAG_API_KEY || "").trim();
  if (!apiKey) {
    res.status(503).json({ error: "TAG_API_KEY not configured on the proxy" });
    return;
  }

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (hopByHop(name) || value == null || value === "") continue;
    headers[name] = value;
  }
  headers.authorization = `Bearer ${apiKey}`;

  const init = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await readBody(req);
    if (body.length) init.body = body;
  }

  try {
    const upstream = await fetch(target, init);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (hopByHop(key)) return;
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length) res.send(buf);
    else res.end();
  } catch (e) {
    res.status(502).json({
      error: "Tag API proxy failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

export function subpathFromQuery(req) {
  const raw = req.query?.path;
  if (raw == null || raw === "") return "";
  if (Array.isArray(raw)) return raw.map(String).join("/");
  return String(raw).replace(/^\/+|\/+$/g, "");
}
