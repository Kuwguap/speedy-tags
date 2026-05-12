#!/usr/bin/env node
// Mirrors the public assets from /admin into /public/backend so that
// `tristatetag.com/backend` always serves the latest Krab admin dashboard
// (Vite copies /public into /dist at build time, and vercel.json rewrites
// /backend to /backend/index.html).
//
// Only `index.html` and `app.js` are copied — admin/.vercel, admin/.env.local,
// admin/vercel.json and admin/.gitignore are intentionally skipped because
// they are either secrets or apply only to the standalone admin deployment.

import { mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const srcDir = join(repoRoot, "admin");
const destDir = join(repoRoot, "public", "backend");

const PUBLIC_FILES = ["index.html", "app.js"];

if (!existsSync(srcDir)) {
  console.log(`[sync-admin] No ${srcDir} folder; skipping.`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const name of PUBLIC_FILES) {
  const src = join(srcDir, name);
  if (!existsSync(src) || !statSync(src).isFile()) {
    console.warn(`[sync-admin] Missing ${src}; skipping.`);
    continue;
  }
  const dest = join(destDir, name);
  copyFileSync(src, dest);
  copied++;
  console.log(`[sync-admin] ${name}: admin/ -> public/backend/`);
}

console.log(`[sync-admin] Done (${copied}/${PUBLIC_FILES.length} files).`);
