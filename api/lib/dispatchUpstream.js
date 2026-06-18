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

function sniffImageMediaType(buf, headerCt, pathHint = "") {
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    return "image/jpeg";
  }
  const ct = String(headerCt || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (ct.startsWith("image/")) return ct;
  const path = String(pathHint || "").split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function isReceiptViewPath(subpath) {
  return String(subpath || "").toLowerCase().includes("receipts/view");
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
    const pathLower = String(subpath || "").toLowerCase();
    const isReceipt = isReceiptViewPath(pathLower);
    if (!res.getHeader("content-type")) {
      if (isReceipt) {
        res.setHeader(
          "content-type",
          sniffImageMediaType(buf, upstream.headers.get("content-type"), pathLower) || "image/jpeg",
        );
      } else {
        res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
      }
    } else if (isReceipt) {
      const ct = String(res.getHeader("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/") || ct.includes("octet-stream")) {
        res.setHeader(
          "content-type",
          sniffImageMediaType(buf, ct, pathLower) || "image/jpeg",
        );
      }
    }
    if (isReceipt && !res.getHeader("content-disposition")) {
      res.setHeader("content-disposition", 'inline; filename="receipt.jpg"');
    }
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
