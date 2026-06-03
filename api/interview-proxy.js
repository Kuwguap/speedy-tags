/**
 * Proxy /api/interview/* → krab-interviewer-bot.
 * Vercel non-Next projects cannot use api/interview/[...path].js catch-alls;
 * vercel.json rewrites /api/interview/(.*) → this handler with ?path=$1
 */
const UPSTREAM = (
  process.env.KRAB_INTERVIEWER_URL || "https://krab-interviewer-bot.onrender.com"
).replace(/\/+$/, "");

export const config = {
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

function subpathFromQuery(req) {
  const raw = req.query?.path;
  if (raw == null || raw === "") return "";
  if (Array.isArray(raw)) return raw.map(String).join("/");
  return String(raw).replace(/^\/+|\/+$/g, "");
}

export default async function handler(req, res) {
  const subpath = subpathFromQuery(req);
  const target = `${UPSTREAM}/api/interview${subpath ? `/${subpath}` : ""}`;

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (hopByHop(name) || value == null || value === "") continue;
    headers[name] = value;
  }

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
      error: "Interview API proxy failed",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
