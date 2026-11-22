/*
 * Build the public bundle: a clean directory with no personal health data.
 *   node tools/build-dist.mjs
 *
 * Layout:
 *   dist/index.html      app shell with the demo dataset wired in
 *   dist/styles.css      styles
 *   dist/app.js          controller
 *   dist/lib/*.js        parser, charts, i18n, skins, worker
 *   dist/data/demo.json  synthetic dataset (generated, not real)
 *   dist/og.png, robots.txt, _headers, privacy.html
 */
import { cp, mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";

const DIST = "dist";
const LIB = ["zip.js", "parse-core.js", "scan.js", "scan-worker.js", "charts.js", "i18n.js", "skins.js", "persona.js", "insights.js"];

await rm(DIST, { recursive: true, force: true });
await mkdir(`${DIST}/lib`, { recursive: true });
await mkdir(`${DIST}/data`, { recursive: true });

for (const f of ["styles.css", "app.js"]) await cp(f, `${DIST}/${f}`);
for (const f of LIB) await cp(`lib/${f}`, `${DIST}/lib/${f}`);

let html = await readFile("index.html", "utf8");
const hook = '<script>window.__SAMPLE_URL__ = "data/demo.json"; window.__DEMO__ = true;</script>\n';
html = html.replace('<script type="module" src="app.js"></script>', `${hook}<script type="module" src="app.js"></script>`);
await writeFile(`${DIST}/index.html`, html);

if (!existsSync("data/demo.json")) {
  throw new Error("data/demo.json missing — run: node tools/make-demo.mjs data/demo.json");
}
await cp("data/demo.json", `${DIST}/data/demo.json`);

for (const f of ["og.png", "robots.txt", "_headers", "privacy.html"]) {
  if (existsSync(f)) await cp(f, `${DIST}/${f}`);
}

// a guard: make sure no real export slipped in
for (const name of await readdir(`${DIST}/data`)) {
  if (name !== "demo.json") throw new Error(`unexpected file in dist/data: ${name}`);
}
const demo = JSON.parse(await readFile(`${DIST}/data/demo.json`, "utf8"));
if (!demo.meta || demo.meta.demo !== true) throw new Error("dist data is not flagged as demo");

let bytes = 0;
for (const f of ["index.html", "styles.css", "app.js", "og.png", "data/demo.json"]) {
  bytes += (await stat(`${DIST}/${f}`)).size;
}
for (const f of LIB) bytes += (await stat(`${DIST}/lib/${f}`)).size;

console.log(`dist/ ready — ${(bytes / 1048576).toFixed(2)} MB, demo dataset only`);
console.log("deploy:  npx wrangler pages deploy dist");
