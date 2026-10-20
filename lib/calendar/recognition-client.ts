import type { InkStroke } from "./ink";
import { strokePath } from "./ink";
import { inkBounds, recognitionLines } from "./recognition-geometry";
export interface RecognitionRun {
  result: Promise<string>;
  cancel: () => void;
}
/** Rasterize only the selected vector lines, in normalized dark ink. The source
 * strokes are never mutated; no image or geometry is uploaded to a service. */
export function recognizeInk(
  strokes: InkStroke[],
  onProgress: (message: string) => void
): RecognitionRun {
  const lines = recognitionLines(strokes);
  if (!lines.length)
    throw new Error(
      "Select some pen handwriting first. Highlight marks are not text."
    );
  if (lines.length > 6)
    throw new Error("Select up to six horizontal lines at a time.");
  if (
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined" ||
    typeof WebAssembly === "undefined"
  )
    throw new Error(
      "Local recognition needs a browser with WebAssembly and OffscreenCanvas. Your original ink remains available."
    );
  const inputs = lines.map((line) => {
    const b = inkBounds(line)!,
      padding = 12,
      scale = Math.min(
        2,
        1500 / (b.width + padding * 2),
        220 / (b.height + padding * 2)
      );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(32, Math.ceil((b.width + padding * 2) * scale));
    canvas.height = Math.max(32, Math.ceil((b.height + padding * 2) * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error(
        "This browser cannot prepare handwriting for recognition."
      );
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.translate(-b.x + padding, -b.y + padding);
    ctx.fillStyle = "#111";
    for (const stroke of line) ctx.fill(new Path2D(strokePath(stroke)));
    return {
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data
        .buffer as ArrayBuffer,
      width: canvas.width,
      height: canvas.height,
    };
  });
  const worker = new Worker(
    new URL("/calendar-recognition/worker.js", window.location.href),
    { type: "module" }
  );
  let settled = false,
    rejectRun: (error: Error) => void = () => {};
  const dispose = () => {
    worker.terminate();
    clearTimeout(timer);
    window.removeEventListener("calendar-session-ended", cancel);
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    dispose();
    rejectRun(
      new Error("Recognition cancelled. Your handwriting is unchanged.")
    );
  };
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      dispose();
      rejectRun(
        new Error(
          "Recognition took too long on this device. Try a smaller selection."
        )
      );
    }
  }, 180000);
  const result = new Promise<string>((resolve, reject) => {
    rejectRun = reject;
    worker.onmessage = (e) => {
      const value = e.data;
      if (value.type === "progress") {
        onProgress(value.message || "Reading handwriting…");
        return;
      }
      if (settled) return;
      settled = true;
      dispose();
      if (
        value.type === "result" &&
        typeof value.text === "string" &&
        value.text.trim()
      )
        resolve(value.text.slice(0, 4000));
      else
        reject(
          new Error(
            value.message ||
              "No clear text was recognized. Try a smaller, clearer line."
          )
        );
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      dispose();
      reject(
        new Error(
          "Local recognition could not start. Check browser support, storage and your connection for the first model download."
        )
      );
    };
    worker.postMessage(
      { lines: inputs },
      inputs.map((i) => i.pixels)
    );
  });
  window.addEventListener("calendar-session-ended", cancel, { once: true });
  return { result, cancel };
}
