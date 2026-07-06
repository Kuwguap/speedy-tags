/** Minimal admin auth: a signed cookie issued after an ADMIN_PASSWORD login. */

import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE = "central_session";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function sign(value) {
  return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

export function issueCookie(res) {
  const exp = Date.now() + TTL_MS;
  const payload = `admin.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${TTL_MS / 1000}; SameSite=Lax`,
  );
}

export function clearCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(
    raw.split(";").map((c) => c.trim().split("=").map(decodeURIComponent)).filter((p) => p[0]),
  );
}

export function isAuthed(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [who, exp, mac] = token.split(".");
  if (who !== "admin" || !exp || !mac) return false;
  const payload = `${who}.${exp}`;
  const expected = sign(payload);
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Number(exp) > Date.now();
}

/** Express guard for dashboard routes. */
export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect("/login");
}

export function checkPassword(input) {
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(config.adminPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && config.adminPassword.length > 0;
}
