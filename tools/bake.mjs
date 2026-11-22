/*
 * Bake data/prepared.json from an Apple Health export zip.
 *   node tools/bake.mjs <export.zip> [out.json]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname } from "node:path";
import { openZip } from "../lib/zip.js";
import { Collector } from "../lib/parse-core.js";

const src = process.argv[2];
const out = process.argv[3] || "data/prepared.json";
if (!src) {
  console.error("usage: node tools/bake.mjs <export.zip> [out.json]");
  process.exit(2);
}

const t0 = Date.now();
const buf = await readFile(src);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
console.log(`zip ${(u8.length / 1048576).toFixed(1)} MB`);

const zip = openZip(u8);
const xml = zip.healthXml();
if (!xml) throw new Error("no xml in zip");
console.log(`xml ${xml.name} ${(xml.size / 1048576).toFixed(1)} MB`);

const col = new Collector();
const dec = new TextDecoder("utf-8");
let bytes = 0;
const stream = zip.stream(xml);
for await (const chunk of stream) {
  col.feed(dec.decode(chunk, { stream: true }));
  bytes += chunk.length;
  if (bytes % (32 * 1048576) < chunk.length) {
    console.log(`  ${(bytes / 1048576).toFixed(0)} MB / ${(xml.size / 1048576).toFixed(0)} MB · ${col.lines} lines`);
  }
}
col.feed(dec.decode());

// ---- GPS routes ----
function parseGpx(text) {
  const pts = [];
  const re = /<trkpt\b([^>]*)>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const la = /lat="([-\d.]+)"/.exec(m[1]);
    const lo = /lon="([-\d.]+)"/.exec(m[1]);
    if (la && lo) pts.push([+la[1], +lo[1]]);
  }
  return pts;
}

function simplify(pts, target = 140) {
  if (pts.length <= target) return pts.map(([a, b]) => [round5(a), round5(b)]);
  const step = (pts.length - 1) / (target - 1);
  const out = [];
  for (let i = 0; i < target; i++) {
    const [a, b] = pts[Math.round(i * step)];
    out.push([round5(a), round5(b)]);
  }
  return out;
}
const round5 = (x) => Math.round(x * 100000) / 100000;

function lengthKm(pts) {
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a1, b1] = pts[i - 1];
    const [a2, b2] = pts[i];
    const dx = (b2 - b1) * 111.32 * Math.cos((a1 * Math.PI) / 180);
    const dy = (a2 - a1) * 110.57;
    km += Math.hypot(dx, dy);
  }
  return km;
}

const routes = [];
for (const e of zip.gpxEntries()) {
  const text = dec.decode(await new Response(zip.stream(e)).arrayBuffer());
  const pts = parseGpx(text);
  if (pts.length < 2) continue;
  const m = /route_(\d{4}-\d{2}-\d{2})/.exec(e.name);
  routes.push({ d: m ? m[1] : "", pts: simplify(pts), km: Math.round(lengthKm(pts) * 100) / 100 });
}
console.log(`routes ${routes.length}`);

const prepared = col.finish();
prepared.routes = routes.sort((a, b) => (a.d < b.d ? -1 : 1));
prepared.meta.zipSize = u8.length;
prepared.meta.xmlSize = xml.size;
prepared.meta.bakedAt = new Date().toISOString();

await mkdir(dirname(out), { recursive: true });
const json = JSON.stringify(prepared);
await writeFile(out, json);

const mb = (json.length / 1048576).toFixed(2);
console.log(`\n${out}  ${mb} MB  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("records", prepared.meta.records, "types", prepared.meta.types,
  "days", prepared.meta.days, "sessions", prepared.sessions.length,
  "devices", prepared.devices.map((d) => d.name + " " + (d.seconds / 3600).toFixed(0) + "h").join(", "));
