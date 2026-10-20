import { env, pipeline, RawImage } from "@huggingface/transformers";
const MODEL = "Xenova/trocr-small-handwritten",
  REVISION = "2432e24d184b1d964d07ed04f5d9e21d31a59141";
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.wasmPaths = new URL(
    /* @vite-ignore */ "./runtime/",
    import.meta.url
  ).href;
}
type Captioner = (
  image: RawImage,
  options: Record<string, unknown>
) => Promise<{ generated_text: string }[]>;
const imagePipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<Captioner>;
let recognizer: Promise<Captioner> | null = null;
self.onmessage = async (
  event: MessageEvent<{
    lines: { pixels: ArrayBuffer; width: number; height: number }[];
  }>
) => {
  try {
    const lines = event.data.lines;
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 6)
      throw new Error("Select one to six lines of English handwriting.");
    if (!recognizer)
      recognizer = imagePipeline("image-to-text", MODEL, {
        revision: REVISION,
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: { status: string; progress?: number }) => {
          if (p.status === "progress")
            self.postMessage({
              type: "progress",
              message: "Downloading recognition data…",
              progress: Math.round(p.progress || 0),
            });
          else
            self.postMessage({
              type: "progress",
              message: "Preparing local recognition…",
            });
        },
      });
    const model = await recognizer,
      text: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.width * line.height > 1600000 ||
        line.pixels.byteLength !== line.width * line.height * 4
      )
        throw new Error("Selected image is too large.");
      self.postMessage({
        type: "progress",
        message: `Reading line ${i + 1} of ${lines.length}…`,
      });
      const output = await model(
        new RawImage(
          new Uint8ClampedArray(line.pixels),
          line.width,
          line.height,
          4
        ),
        { max_new_tokens: 96, num_beams: 1, do_sample: false }
      );
      const result = Array.isArray(output) ? output.flat()[0] : output;
      text.push(result?.generated_text?.trim() || "");
    }
    self.postMessage({ type: "result", text: text.join("\n").trim() });
  } catch (error) {
    recognizer = null;
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Recognition could not run on this device.",
    });
  }
};
