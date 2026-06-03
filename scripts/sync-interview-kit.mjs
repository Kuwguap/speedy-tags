/**
 * Copies driver-hiring-kit → public/interview for TriStateTags /interview funnel.
 * Run: npm run sync:interview (also runs in prebuild).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "driver-hiring-kit");
const outDir = join(root, "public", "interview");
const BASE = "/interview/";

if (!existsSync(srcDir)) {
  console.error("Missing driver-hiring-kit/ — add the folder from krab-interviewer.");
  process.exit(1);
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

function copyRecursive(from, to) {
  for (const name of readdirSync(from, { withFileTypes: true })) {
    const s = join(from, name.name);
    const d = join(to, name.name);
    if (name.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      cpSync(s, d);
    }
  }
}

copyRecursive(srcDir, outDir);

// Form page: interview.html → apply.html (clean URL /interview/apply)
const formSrc = join(outDir, "interview.html");
const formDst = join(outDir, "apply.html");
if (existsSync(formSrc)) {
  cpSync(formSrc, formDst);
}

const htmlFiles = readdirSync(outDir).filter((f) => f.endsWith(".html"));

for (const file of htmlFiles) {
  let html = readFileSync(join(outDir, file), "utf8");

  if (!html.includes("<base ")) {
    html = html.replace(/<head>/i, `<head>\n  <base href="${BASE}" />`);
  }

  html = html
    .replace(/href="index\.html"/g, 'href="./"')
    .replace(/href="interview\.html"/g, 'href="apply.html"')
    .replace(/Tri State <span>Tags<\/span>/g, 'TriState<span>Tags</span>')
    .replace(/Tri State Tags/g, "TriStateTags");

  if (!html.includes('href="/"') && html.includes("funnel-nav-links")) {
    html = html.replace(
      /(<div class="funnel-nav-links">)/,
      '$1\n        <a href="/">Store</a>',
    );
  }

  writeFileSync(join(outDir, file), html, "utf8");
}

// Site-specific API config (same-origin proxy via Vercel / Express)
writeFileSync(
  join(outDir, "static", "config.js"),
  `/**
 * Same-origin: /api/interview/* proxied to krab-interviewer-bot (vercel.json + server/index.js).
 */
window.KRAB_API_BASE_URL = "";
window.KRAB_BRAND_NAME = "TriStateTags";
`,
  "utf8",
);

console.log("Synced driver-hiring-kit → public/interview (base:", BASE + ")");
