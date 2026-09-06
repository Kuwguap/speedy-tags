import { proxyConfig, proxyToTagUpstream, subpathFromQuery } from "./lib/tagUpstream.js";

export const config = proxyConfig;

/** vercel.json rewrites /api/tag/(.*) here. Injects the API key server-side. */
export default function handler(req, res) {
  return proxyToTagUpstream(req, res, subpathFromQuery(req));
}
