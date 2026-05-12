#!/usr/bin/env node
// Mirrors the public assets from /admin into /public/backend so that
// `tristatetag.com/backend` always serves the latest Krab admin dashboard
// (Vite copies /public into /dist at build time, and vercel.json rewrites
// /backend to /backend/index.html).
//
// Only `index.html` and `app.js` are copied — admin/.vercel, admin/.env.local,
// admin/vercel.json and admin/.gitignore are intentionally skipped because
// they are either secrets or apply only to the standalone admin deployment.
//
// While copying index.html, this script rewrites the relative
// `<script src="app.js">` into an absolute `<script src="/backend/app.js?v=…">`
// so that when the page is served at /backend (no trailing slash), the
// browser doesn't resolve the script URL against / and hit Vercel's SPA
// catch-all rewrite (which would return the React index.html as text/html
// and break every button on the admin page). The cache-buster `?v=…` is the
// content hash of app.js, so browsers always pick up the new JS on deploy.

import {
  mkdirSync,
  copyFileSync,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const srcDir = join(repoRoot, "admin");
const destDir = join(repoRoot, "public", "backend");

const BACKEND_BASE = "/backend";

if (!existsSync(srcDir)) {
  console.log(`[sync-admin] No ${srcDir} folder; skipping.`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

const appJsSrc = join(srcDir, "app.js");
const indexHtmlSrc = join(srcDir, "index.html");

if (!existsSync(appJsSrc) || !statSync(appJsSrc).isFile()) {
  console.warn(`[sync-admin] Missing ${appJsSrc}; aborting.`);
  process.exit(1);
}
if (!existsSync(indexHtmlSrc) || !statSync(indexHtmlSrc).isFile()) {
  console.warn(`[sync-admin] Missing ${indexHtmlSrc}; aborting.`);
  process.exit(1);
}

copyFileSync(appJsSrc, join(destDir, "app.js"));
const appJsBytes = readFileSync(appJsSrc);
const appJsHash = createHash("sha1").update(appJsBytes).digest("hex").slice(0, 10);
console.log(`[sync-admin] app.js: admin/ -> public/backend/ (hash=${appJsHash})`);

let html = readFileSync(indexHtmlSrc, "utf8");
const before = html;

const scriptTag = /<script\s+src=(["'])\.?\/?app\.js\1\s*>/g;
const replacement = `<script src="${BACKEND_BASE}/app.js?v=${appJsHash}">`;
html = html.replace(scriptTag, replacement);

if (html === before) {
  console.warn(
    `[sync-admin] Did not find <script src="app.js"> in admin/index.html — ` +
      `serving at ${BACKEND_BASE} may break relative URLs. Check the source.`,
  );
}

writeFileSync(join(destDir, "index.html"), html);
console.log(
  `[sync-admin] index.html: admin/ -> public/backend/ ` +
    `(script src rewritten to ${BACKEND_BASE}/app.js?v=${appJsHash})`,
);
console.log(`[sync-admin] Done.`);
