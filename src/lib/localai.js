// Stillpoint — "Local AI mode"
// Uses WebLLM (WebGPU) on the main thread if available, or falls back
// to Transformers.js (CPU/WASM) running inside a dedicated Web Worker.

import * as webllm from "@mlc-ai/web-llm";
import { detectDeviceTier } from "./deviceCapability";

export const MODEL_CATALOG = {
  tiny: {
    id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    cpuId: "HuggingFaceTB/SmolLM2-360M-Instruct",
    label: "Tiny",
    params: "360M",
    approxSizeLabel: "~300 MB",
    blurb: "Fastest to download, most limited responses.",
  },
  small: {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    cpuId: "Qwen/Qwen2.5-0.5B-Instruct",
    label: "Small",
    params: "0.5B",
    approxSizeLabel: "~400 MB",
    blurb: "Good balance for lighter laptops and older phones.",
  },
  medium: {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    cpuId: "onnx-community/Llama-3.2-1B-Instruct",
    label: "Medium",
    params: "1B",
    approxSizeLabel: "~880 MB",
    blurb: "Stillpoint's default — solid quality on most laptops.",
  },
  large: {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    cpuId: "onnx-community/Llama-3.2-3B-Instruct",
    label: "Large",
    params: "3B",
    approxSizeLabel: "~2.3 GB",
    blurb: "Best quality; needs a capable desktop GPU.",
  },
};

const TIER_ORDER = ["tiny", "small", "medium", "large"];

let engineType = null; // 'webgpu' or 'wasm'
let engine = null;     // WebLLM instance
let isLoading = false;
let isReady = false;
let readyModelKey = null;
let activeDownload = null; // { promise, cancelState }

// ---- Worker plumbing for the WASM backend ----------------------------------
//
// We reuse a single Worker across init/dispose cycles within the same
// session, so the WASM binary and tokenizer don't have to be re-parsed
// every time the user toggles Local AI off and back on.
let worker = null;
let nextMessageId = 1;
const pendingRequests = new Map(); // id -> { resolve, reject, onProgress? }

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(
    new URL("./workers/localaiWorker.js", import.meta.url),
    { type: "module" }
  );
  worker.addEventListener("message", (event) => {
    const { id, type, payload } = event.data || {};
    if (typeof id !== "number") return;
    const pending = pendingRequests.get(id);
    if (!pending) return;

    switch (type) {
      case "progress":
        pending.onProgress?.(payload);
        break;
      case "token":
        // Streaming token chunk — fire callback but do NOT resolve;
        // the request resolves only on the final `result` message.
        pending.onToken?.(payload?.chunk ?? "");
        break;
      case "ready":
        pending.resolve(payload);
        pendingRequests.delete(id);
        break;
      case "result":
        pending.resolve(payload);
        pendingRequests.delete(id);
        break;
      case "disposed":
        pending.resolve(payload);
        pendingRequests.delete(id);
        break;
      case "error": {
        pendingRequests.delete(id);
        const err = new Error(payload?.message || "Worker error");
        if (payload?.code) err.code = payload.code;
        pending.reject(err);
        break;
      }
      default:
        // ignore unknown
        break;
    }
  });
  return worker;
}

function postToWorker(type, payload, { onProgress, onToken } = {}) {
  const id = nextMessageId++;
  const w = ensureWorker();
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onProgress, onToken });
    w.postMessage({ id, type, payload });
  });
}
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION = `
You are a supportive, grounding presence for someone who is having a
difficult emotional moment. The user will share what they're feeling in
their own words. Respond directly to what they wrote — do not analyze,
summarize, or restate their words back to them.

Rules you must follow:
- Do not diagnose, label, or speculate about any mental health condition.
- Do not give medical, clinical, or crisis advice.
- Keep your response short: 2-4 sentences.
- Be warm and validating without being clinical or generic.
- Do not ask the person to describe their situation further; respond to
  what they've already shared.
- Do not reference "the input," "the data I was given," or the prompt
  itself — respond as if naturally supporting a person, not analyzing
  a text payload.
- Never mention that you are an AI, a language model, or that you lack
  emotions. Just respond supportively.
- If the person expresses something serious but not a crisis, respond
  gently and stay with them in the feeling rather than offering fixes.
- Crisis situations are handled before this prompt is ever shown, so
  you don't need to render crisis resources yourself.
`.trim();

/**
 * Checks whether Local AI can run in this browser.
 * Returns true if either WebAssembly (CPU fallback) or WebGPU is present.
 */
export function isLocalAISupported() {
  return typeof window !== "undefined" && typeof WebAssembly === "object";
}

/**
 * Helper to test if WebGPU is specifically available on the host device.
 */
async function hasWebGPUSupport() {
  if (typeof navigator === "undefined" || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Recommends a model tier based on device capabilities.
 */
export async function recommendModel() {
  const { tier, score, signals } = await detectDeviceTier();
  return {
    recommendedTier: tier,
    score,
    signals,
    catalog: MODEL_CATALOG,
    tierOrder: TIER_ORDER,
  };
}

export function isLocalAIReady() {
  return isReady;
}

export function getReadyModelKey() {
  return readyModelKey;
}

/**
 * Cancels the currently active download/initialization process AND any
 * in-flight generation. Safe to call from the crisis-gate path: if the
 * user submits crisis text mid-generation, this stops the worker before
 * the local model can finish streaming a response that would otherwise
 * be visible alongside the crisis panel.
 */
export function cancelLocalAIDownload() {
  if (activeDownload) {
    if (activeDownload.cancelState) {
      activeDownload.cancelState.cancelled = true;
    }
  }
  if (engineType === "webgpu" && engine && typeof engine.interruptGenerate === "function") {
    try {
      engine.interruptGenerate();
    } catch {}
  }
  // Signal the worker to abort whatever it is doing — init or generate.
  try {
    if (worker) {
      const id = nextMessageId++;
      worker.postMessage({ id, type: "cancel", payload: {} });
    }
  } catch {
    /* worker might not exist yet — that's fine */
  }
}

/**
 * Aborts any in-flight generation. Equivalent to cancelLocalAIDownload()
 * for the abort step, but named to reflect intent when the call comes
 * from the crisis-gate path (not a user-initiated cancel).
 */
export function abortLocalAIInfight() {
  cancelLocalAIDownload();
}

/**
 * Initializes the Local AI engine. Automatically routes to WebGPU (WebLLM)
 * if available, or falls back to WebAssembly CPU (Transformers.js) running
 * in a dedicated Web Worker if not.
 */
export async function initLocalAI(onProgress, options = {}) {
  const tier = options.tier && MODEL_CATALOG[options.tier] ? options.tier : "medium";

  if (isReady && readyModelKey === tier) return engine;
  if (isLoading && activeDownload) return activeDownload.promise;

  if (isReady && readyModelKey !== tier) {
    await unloadLocalAI();
  }

  isLoading = true;
  const cancelState = { cancelled: false };

  const downloadPromise = (async () => {
    try {
      const supportsGPU = await hasWebGPUSupport();
      engineType = supportsGPU ? "webgpu" : "wasm";

      if (engineType === "webgpu") {
        const modelId = MODEL_CATALOG[tier].id;
        engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (report) => {
            if (cancelState.cancelled) return;
            if (onProgress) onProgress(report);
          },
        });

        if (cancelState.cancelled) {
          await engine.unload();
          engine = null;
          throw new Error("cancelled");
        }
      } else {
        // WASM path — runs in a Web Worker so the main thread stays
        // responsive during the (potentially long) weight download and
        // WebAssembly compilation.
        const cpuModelId = MODEL_CATALOG[tier].cpuId;
        await postToWorker(
          "init",
          { tier, modelId: cpuModelId },
          {
            onProgress: (report) => {
              if (cancelState.cancelled) return;
              if (!onProgress) return;
              // Translate the worker's typed phases into the shape the
              // hook already understands ({ progress, text }).
              if (report.phase === "loading-weights" || report.phase === "downloading") {
                onProgress({
                  progress: report.progress ?? 0,
                  text: report.text || `Loading on-device model…`,
                });
              } else if (report.phase === "compiling-wasm") {
                onProgress({ progress: 0, text: "Compiling WebAssembly…" });
              } else if (report.phase === "preparing") {
                onProgress({ progress: 0, text: report.text || "Preparing on-device model…" });
              } else if (report.phase === "ready") {
                onProgress({ progress: 1, text: "Ready on-device." });
              }
            },
          }
        );

        if (cancelState.cancelled) {
          // Worker has already disposed internally and replied with an
          // error of code "cancelled" — we re-throw to signal cancel.
          throw new Error("cancelled");
        }
      }

      isReady = true;
      readyModelKey = tier;
      return engine;
    } finally {
      isLoading = false;
      activeDownload = null;
    }
  })();

  activeDownload = { promise: downloadPromise, cancelState };
  return downloadPromise;
}

/**
 * Generates a supportive response on-device using whichever engine was initialized.
 * For the WASM path, `onToken(chunk)` is invoked for each decoded word chunk
 * as the model produces it, so the caller can stream the response to the UI.
 */
export async function generateLocal(prompt, onToken) {
  if (!isReady) {
    throw new Error("Local AI engine not initialized. Call initLocalAI() first.");
  }

  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTION },
    { role: "user", content: prompt },
  ];

  if (engineType === "webgpu" && engine) {
    const response = await engine.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 120,
    });
    return response.choices[0]?.message?.content ?? "";
  } else if (engineType === "wasm") {
    const { text } = await postToWorker(
      "generate",
      {
        messages,
        options: { max_new_tokens: 120, temperature: 0.7, do_sample: true },
      },
      { onToken }
    );
    return text || "";
  }

  throw new Error("No active local engine available.");
}

/**
 * Disposes loaded engines to free system memory.
 */
export async function unloadLocalAI() {
  if (engine) {
    await engine.unload();
    engine = null;
  }
  if (engineType === "wasm" && worker) {
    try {
      await postToWorker("dispose", {});
    } catch {
      /* ignore */
    }
  }
  isReady = false;
  readyModelKey = null;
  engineType = null;
}
