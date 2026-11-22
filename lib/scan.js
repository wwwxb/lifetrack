/*
 * One scanner for both the worker and the main thread.
 * Sniffs the file by content (not by name), reads it with real progress,
 * then streams the XML through the collector.
 *
 * stage: "read" | "unzip" | "scan" | "finish"
 * onProgress({ stage, pct, bytes, total, records, lines })
 *
 * Every failure carries a `code` so the UI can explain it instead of saying
 * "读取失败".
 */

import { openZip } from "./zip.js";
import { Collector } from "./parse-core.js";

const MAX_BYTES = 1.5 * 1024 ** 3; // 1.5 GB — beyond this a browser will choke

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

/** zip / xml / unknown, decided by the first bytes rather than the file name. */
async function sniff(file) {
  let head;
  try {
    head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  } catch (e) {
    throw fail("read_failed", e && e.message);
  }
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return "zip"; // PK
  let text = "";
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(head);
  } catch (_) {
    text = "";
  }
  if (/^\uFEFF?\s*</.test(text)) return "xml";
  return "unknown";
}

/** Read a Blob into an ArrayBuffer, reporting bytes as they arrive. */
async function readAll(blob, onBytes) {
  const total = blob.size;
  const reader = blob.stream().getReader();
  const chunks = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.length;
      onBytes(read, total);
    }
  } catch (e) {
    throw fail("read_failed", e && e.message);
  } finally {
    try { reader.releaseLock(); } catch (_) { /* ignore */ }
  }
  const out = new Uint8Array(read);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

async function scanStream(stream, total, onProgress, kind) {
  const col = new Collector();
  const dec = new TextDecoder("utf-8");
  const reader = stream.getReader();
  let read = 0;
  let last = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      col.feed(dec.decode(value, { stream: true }));
      read += value.length;
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
  } catch (e) {
    if (e && e.code) throw e;
    throw fail(kind === "zip" ? "unzip_failed" : "read_failed", e && e.message);
  } finally {
    try { reader.releaseLock(); } catch (_) { /* ignore */ }
  }
  col.feed(dec.decode());
  if (!col.records) throw fail("not_health");
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
  if (!file || !file.size) throw fail("empty_file");
  onProgress({ stage: "read", pct: 1 });

  const kind = await sniff(file);

  if (kind === "xml") {
    if (file.size > MAX_BYTES) throw fail("too_large");
    onProgress({ stage: "scan", pct: 12, bytes: 0, total: file.size });
    return scanStream(file.stream(), file.size, onProgress, "xml");
  }

  if (kind !== "zip") throw fail("not_zip");

  if (!supportsDeflateRaw) throw fail("no_inflate");
  if (file.size > MAX_BYTES) throw fail("too_large");

  const buf = await readAll(file, (read, total) => {
    onProgress({ stage: "read", pct: 1 + 9 * (total ? read / total : 0), bytes: read, total });
  });
  onProgress({ stage: "unzip", pct: 11 });

  let zip;
  try {
    zip = openZip(new Uint8Array(buf));
  } catch (e) {
    throw fail("not_zip", e && e.message);
  }
  const xml = zip.healthXml();
  if (!xml) throw fail("not_health");
  if (xml.size > MAX_BYTES) throw fail("too_large");

  onProgress({ stage: "unzip", pct: 12, bytes: 0, total: xml.size });
  return scanStream(zip.stream(xml), xml.size, onProgress, "zip");
}
