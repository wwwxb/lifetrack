/*
 * Minimal ZIP reader: central directory scan + streamed inflate.
 * Works in the browser and in Node (both expose DecompressionStream + Web streams).
 */

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

/** @param {Uint8Array} u8 */
export function openZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const len = u8.length;
  let eocd = -1;
  const floor = Math.max(0, len - 22 - 65557);
  for (let i = len - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw zipError("zip_broken", "end of central directory not found");

  const total = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  if (dv.getUint32(eocd + 12, true) > 0xffff || dv.getUint32(eocd + 16, true) === 0xffffffff) {
    // ZIP64 end locator
    const locAt = eocd - 20;
    if (locAt >= 0 && dv.getUint32(locAt, true) === 0x07064b50) {
      const e64 = Number(dv.getBigUint64(locAt + 8, true));
      if (dv.getUint32(e64, true) === 0x06064b50) {
        off = Number(dv.getBigUint64(e64 + 48, true));
      }
    }
  }

  const dec = new TextDecoder("utf-8");
  const entries = [];
  for (let i = 0; i < total; i++) {
    if (off + 46 > len || dv.getUint32(off, true) !== CEN) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    entries.push({ name, method, compSize, size, lho, encrypted: (dv.getUint16(off + 8, true) & 1) === 1 });
    off += 46 + nameLen + extraLen + commentLen;
  }
  if (!entries.length) throw zipError("zip_broken", "no entries");

  /** Byte range of an entry's payload. */
  function range(entry) {
    const lho = entry.lho;
    if (dv.getUint32(lho, true) !== LOC) throw zipError("zip_broken", "bad local header");
    const nameLen = dv.getUint16(lho + 26, true);
    const extraLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + nameLen + extraLen;
    return [start, start + entry.compSize];
  }

  /** @returns {ReadableStream<Uint8Array>} */
  function stream(entry) {
    if (entry.encrypted) throw zipError("zip_encrypted", "encrypted entry");
    const [start, end] = range(entry);
    if (end > len) throw zipError("zip_truncated", "entry past end of file");
    const slice = u8.subarray(start, end);
    if (entry.method === 0) {
      return new ReadableStream({ start(c) { c.enqueue(slice); c.close(); } });
    }
    if (entry.method !== 8) throw zipError("zip_unsupported", "method " + entry.method);
    const raw = new ReadableStream({
      start(c) { c.enqueue(slice); c.close(); },
    });
    return raw.pipeThrough(new DecompressionStream("deflate-raw"));
  }

  return {
    entries,
    stream,
    find: (pred) => entries.find(pred),
    /** The health export XML: the big .xml entry, whatever it is called. */
    healthXml() {
      let best = null;
      for (const e of entries) {
        if (!/\.xml$/i.test(e.name)) continue;
        if (!best || e.size > best.size) best = e;
      }
      return best;
    },
    gpxEntries: () => entries.filter((e) => /\.gpx$/i.test(e.name)),
  };
}

export function zipError(code, detail) {
  const err = new Error(code + ": " + detail);
  err.code = code;
  return err;
}
