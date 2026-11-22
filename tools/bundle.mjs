/*
 * Inline every module, style sheet and the baked dataset into one HTML file that
 * works straight from disk (file://), with no server.
 *   node tools/bundle.mjs [out.html]
 */
import { readFile, writeFile } from "node:fs/promises";

const OUT = process.argv[2] || "lifetrack.html";

const MODULES = [
  { file: "lib/i18n.js", key: "i18n", exports: ["I18n", "t"] },
  { file: "lib/zip.js", key: "zip", exports: ["openZip", "zipError"] },
  { file: "lib/parse-core.js", key: "core", exports: ["Collector", "parseWhen"] },
  { file: "lib/scan.js", key: "scan", exports: ["scanFile", "fail", "supportsDeflateRaw"] },
  { file: "lib/charts.js", key: "charts", exports: ["areaLine", "bars", "calendar", "sunburst", "weekBars", "heatGrid", "radar", "routeMap", "spark"] },
  { file: "lib/skins.js", key: "skins", exports: ["SKINS", "paint", "current", "save", "swatch"] },
  { file: "lib/persona.js", key: "persona", exports: ["persona"] },
  { file: "lib/insights.js", key: "insights", exports: ["insights"] },
  { file: "app.js", key: "app", exports: [] },
];

const html = await readFile("index.html", "utf8");
const css = await readFile("styles.css", "utf8");
const data = await readFile("data/prepared.json", "utf8").catch(() => null);

let bundle = "";
for (const m of MODULES) {
  let src = await readFile(m.file, "utf8");
  const deps = [];
  src = src.replace(/^import\s+(\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+"\.\/(?:lib\/)?([\w-]+)\.js";?$/gm, (all, spec, starName, names, dep) => {
    deps.push({ dep, starName, names: names ? names.split(",").map((s) => s.trim().split(/\s+as\s+/).pop()) : null });
    return "";
  });
  const detected = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
  if (detected.length) m.exports = detected;
  src = src
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+function\s+/gm, "function ")
    .replace(/^export\s+class\s+/gm, "class ")
    .replace(/^export\s+const\s+/gm, "const ")
    .replace(/^export\s+let\s+/gm, "let ");
  const keyFor = (dep) => {
    const hit = MODULES.find((x) => x.file.endsWith(dep + ".js"));
    if (!hit) throw new Error(`unknown module import: ${dep} (from ${m.file})`);
    return hit.key;
  };
  const prelude = deps
    .map((d) => {
      const k = keyFor(d.dep);
      return d.starName ? `const ${d.starName} = __m["${k}"];` : `const { ${d.names.join(", ")} } = __m["${k}"];`;
    })
    .join("\n");
  const ret = m.exports.length ? `return { ${m.exports.join(", ")} };` : "return {};";
  bundle += `\n/* ===== ${m.file} ===== */\n__m["${m.key}"] = (function () {\n"use strict";\n${prelude}\n${src}\n${ret}\n})();\n`;
}

const payload = `window.__NO_WORKER__ = true;\nconst __m = {};\n${data ? `const __PREPARED__ = ${data};\nwindow.__PREPARED__ = __PREPARED__;\n` : ""}${bundle}`;

let out = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${payload}\n</script>`);

await writeFile(OUT, out);
console.log(`${OUT}  ${(out.length / 1048576).toFixed(2)} MB  (modules ${MODULES.length}${data ? ", dataset inlined" : ""})`);
