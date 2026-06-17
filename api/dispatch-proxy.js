import { proxyConfig, proxyToDispatchUpstream, subpathFromQuery } from "./lib/dispatchUpstream.js";

export const config = proxyConfig;

/** Proxies /api/dispatch/* → krab-dispatch-api (same-origin; fixes mobile Safari cross-origin failures). */
export default function handler(req, res) {
  return proxyToDispatchUpstream(req, res, subpathFromQuery(req));
}
