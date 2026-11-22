/* Module worker: parses the export off the main thread. */

import { scanFile } from "./scan.js";

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "start") return;
  try {
    const data = await scanFile(msg.file, (p) => self.postMessage({ type: "progress", p }));
    self.postMessage({ type: "done", data });
  } catch (err) {
    self.postMessage({
      type: "error",
      code: (err && err.code) || "read_failed",
      message: (err && err.message) || "",
    });
  }
};
