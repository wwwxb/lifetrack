/*
 * One scanner for both the worker and the main thread.
 * Reads the file with real progress, then streams the XML through the collector.
 *
 * stage: "read" | "unzip" | "scan" | "finish"
 * onProgress({ stage, pct, bytes, total, records, lines })
 */

import { openZip } from "./zip.js";
import { Collector } from "./parse-core.js";

export function fail(code, detail) {
  const err = new Error(code + (detail ? ": " + detail : ""));
  err.code = code;
  return err;
}

export const supportsDeflateRaw = (() => {
  try {
    if (typeof DecompressionStream !== "function") return false;
    new DecompressionStream("deflate-raw");
    return true;
  } catch (_) {
    return false;
  }
})();

/** Read a Blob into an ArrayBuffer, reporting bytes as they arrive. */
async function readAll(blob, onBytes) {
  const total = blob.size;
  const reader = blob.stream().getReader();
  const chunks = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    read += value.length;
    onBytes(read, total);
  }
  const out = new Uint8Array(read);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

async function scanStream(stream, total, onProgress) {
  const col = new Collector();
  const dec = new TextDecoder("utf-8");
  let read = 0;
  let last = 0;
  for await (const chunk of stream) {
    col.feed(dec.decode(chunk, { stream: true }));
    read += chunk.length;
    const now = Date.now();
    if (now - last > 90) {
      last = now;
      onProgress({
        stage: "scan",
        pct: 12 + 82 * Math.min(1, total ? read / total : 0.5),
        bytes: read,
        total,
        records: col.records,
        lines: col.lines,
      });
    }
  }
  col.feed(dec.decode());
  onProgress({ stage: "finish", pct: 96, records: col.records, lines: col.lines });
  const data = col.finish();
  if (!data.coverage.length) throw fail("not_health");
  onProgress({ stage: "done", pct: 100, records: col.records });
  return data;
}

/**
 * @param {File|Blob} file
 * @param {(p:object)=>void} onProgress
 */
export async function scanFile(file, onProgress = () => {}) {
  const name = file.name || "";
  onProgress({ stage: "read", pct: 1 });

  if (/\.xml$/i.test(name) || file.type === "text/xml") {
    onProgress({ stage: "scan", pct: 12, bytes: 0, total: file.size });
    return scanStream(file.stream(), file.size, onProgress);
  }

  if (!supportsDeflateRaw) throw fail("no_inflate");

  const buf = await readAll(file, (read, total) => {
    onProgress({ stage: "read", pct: 1 + 9 * (total ? read / total : 0), bytes: read, total });
  });
  onProgress({ stage: "unzip", pct: 11 });

  const zip = openZip(new Uint8Array(buf));
  const xml = zip.healthXml();
  if (!xml) throw fail("not_health");

  onProgress({ stage: "unzip", pct: 12, bytes: 0, total: xml.size });
  return scanStream(zip.stream(xml), xml.size, onProgress);
}
