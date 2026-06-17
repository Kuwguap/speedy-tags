/** Shared proxy to krab-dispatch-api for /api/dispatch/* routes (same-origin for mobile). */
export const UPSTREAM = (
  process.env.KRAB_DISPATCH_API_URL || "https://krab-dispatch-api.onrender.com"
).replace(/\/+$/, "");

export const proxyConfig = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

function hopByHop(name) {
  const n = name.toLowerCase();
  return (
    n === "host" ||
    n === "connection" ||
    n === "content-length" ||
    n === "transfer-encoding" ||
    n === "content-encoding"
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function buildUpstreamUrl(subpath, req) {
  const path = String(subpath || "").replace(/^\/+|\/+$/g, "");
  const base = path ? `${UPSTREAM}/${path}` : UPSTREAM;
  const q = { ...(req.query || {}) };
  delete q.path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
    } else {
      params.append(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function proxyToDispatchUpstream(req, res, subpath) {
  const target = buildUpstreamUrl(subpath, req);

  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (hopByHop(name) || value == null || value === "") continue;
    headers[name] = value;
  }
  // Ask upstream for uncompressed JSON — avoids Safari breaking on mismatched content-encoding.
  headers["accept-encoding"] = "identity";

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
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    if (buf.length) res.send(buf);
    else res.end();
  } catch (e) {
    res.status(502).json({
      error: "Dispatch API proxy failed",
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
