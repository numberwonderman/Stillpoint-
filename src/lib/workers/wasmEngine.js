// wasmEngine.js — worker-side wrapper around the transformers.js pipeline.
//
// Owns the pipeline instance, exposes init / generate / dispose, and
// forwards progress events with a typed `phase` so the UI can show
// "Downloading weights…" / "Compiling WebAssembly…" / "Loading tokenizer…"
// instead of a single undifferentiated bar.

import { pipeline, env, TextStreamer } from "@huggingface/transformers";

// transformers.js runs inside this worker. Configure ONNX the same way
// the main-thread version did (the worker context is detected internally
// by the library, so the same env flags apply).
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 4;
}

/**
 * WasmEngine wraps a single text-generation pipeline and exposes
 * lifecycle methods that map cleanly onto the worker's message protocol.
 */
export class WasmEngine {
  constructor() {
    this.pipelineInstance = null;
    this.currentTier = null;
    this.cancelled = false;
  }

  /**
   * Initialize the pipeline for the given model tier.
   *
   * @param {string} tier           one of "tiny" | "small" | "medium" | "large"
   * @param {string} modelId        the Hugging Face model id (cpuId)
   * @param {(report: {phase: string, progress?: number, text?: string, file?: string}) => void} onProgress
   * @returns {Promise<{tier: string, modelId: string}>}
   */
  async init(tier, modelId, onProgress) {
    this.cancelled = false;
    this.currentTier = tier;

    onProgress?.({ phase: "preparing", text: "Preparing on-device model…" });

    const instance = await pipeline("text-generation", modelId, {
      device: "wasm",
      dtype: "q4",
      progress_callback: (report) => {
        if (this.cancelled) return;

        // transformers.js reports { status, progress, file } where status
        // is one of "initiate" | "download" | "progress" | "done" | "ready".
        switch (report.status) {
          case "initiate":
            onProgress?.({
              phase: "downloading",
              progress: 0,
              text: `Starting download of ${report.file || "weights"}…`,
              file: report.file,
            });
            break;
          case "download":
            onProgress?.({
              phase: "downloading",
              progress: 0,
              text: `Downloading ${report.file || "weights"}…`,
              file: report.file,
            });
            break;
          case "progress":
            onProgress?.({
              phase: "loading-weights",
              progress: (report.progress || 0) / 100,
              text: `Loading ${report.file || "weights"}…`,
              file: report.file,
            });
            break;
          case "done":
            onProgress?.({
              phase: "loading-weights",
              progress: 1,
              text: `${report.file || "weights"} loaded.`,
              file: report.file,
            });
            break;
          case "ready":
            onProgress?.({
              phase: "compiling-wasm",
              text: "Compiling WebAssembly…",
            });
            break;
          default:
            // Ignore unknown statuses — the main thread's progress bar
            // only moves on `progress` events anyway.
            break;
        }
      },
    });

    if (this.cancelled) {
      if (instance?.dispose) {
        try {
          await instance.dispose();
        } catch {
          /* ignore */
        }
      }
      this.pipelineInstance = null;
      const err = new Error("cancelled");
      err.code = "cancelled";
      throw err;
    }

    this.pipelineInstance = instance;
    onProgress?.({ phase: "ready", progress: 1, text: "Ready on-device." });
    return { tier, modelId };
  }

  /**
   * Run a single generation. Caller must have awaited init().
   * Tokens are streamed back to the main thread via `onToken(chunk)`.
   */
  async generate(messages, options, onToken) {
    this.cancelled = false;
    if (!this.pipelineInstance) {
      throw new Error("Local AI engine not initialized. Call initLocalAI() first.");
    }

    // `TextStreamer` decodes token IDs into text as the model produces
    // them, calling our `callback_function` for each whole-word chunk.
    // We forward each chunk to the main thread immediately so the UI
    // can render the response token-by-token.
    const streamer = new TextStreamer(this.pipelineInstance.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk) => {
        if (this.cancelled) return;
        onToken?.(chunk);
      },
    });

    const response = await this.pipelineInstance(messages, {
      ...options,
      streamer,
    });

    // A cancel can arrive while the pipeline call above is in flight —
    // it isn't natively interruptible, so we can only check afterward.
    // Without this, a cancelled generation still resolves with the full
    // text and the caller (runLocalAIPipeline) posts it to the same
    // message id as a normal reply, which is exactly what abortLocalAIInfight()
    // is supposed to prevent on the crisis-gate path (see cancelLocalAIDownload's
    // doc comment in localai.js).
    if (this.cancelled) {
      const err = new Error("cancelled");
      err.code = "cancelled";
      throw err;
    }

    return response;
  }

  /**
   * Free the pipeline instance.
   */
  async dispose() {
    this.cancelled = true;
    if (this.pipelineInstance?.dispose) {
      try {
        await this.pipelineInstance.dispose();
      } catch {
        /* ignore */
      }
    }
    this.pipelineInstance = null;
    this.currentTier = null;
  }
}
