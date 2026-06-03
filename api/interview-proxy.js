import { proxyConfig, proxyToInterviewUpstream, subpathFromQuery } from "./lib/interviewUpstream.js";

export const config = proxyConfig;

/** Fallback when vercel.json rewrites /api/interview/(.*) here. */
export default function handler(req, res) {
  return proxyToInterviewUpstream(req, res, subpathFromQuery(req));
}
