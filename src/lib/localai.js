// Stillpoint — "Local AI mode"
// Uses WebLLM (WebGPU) if available, falls back to Transformers.js (CPU/WASM) if not.

import * as webllm from "@mlc-ai/web-llm";
import { pipeline, env } from "@huggingface/transformers";
import { detectDeviceTier } from "./deviceCapability";

// Configure Transformers.js for optimal browser/CPU performance
env.allowLocalModels = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 4;
}

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
let wasmEngine = null; // Transformers.js pipeline instance
let isLoading = false;
let isReady = false;
let readyModelKey = null;
let activeDownload = null; // { promise, cancelState }

const SYSTEM_INSTRUCTION = `
You are a supportive, grounding presence for someone who is having a
difficult emotional moment. You will receive only a small structured
summary — never the person's own words — describing broad emotion
categories, an intensity level, any emotions they explicitly said they
do NOT feel, and a general context tag.

Rules you must follow:
- Do not diagnose, label, or speculate about any mental health condition.
- Do not give medical, clinical, or crisis advice.
- Keep your response short: 2-4 sentences.
- Be warm and validating without being clinical or generic.
- Do not ask the person to describe their situation further; respond to
  what's already summarized.
- Do not reference "the JSON object," "the data I was given," or the
  structured summary itself — respond as if naturally supporting a
  person, not analyzing a data payload.
- Never mention that you are an AI, a language model, or that you lack
  emotions. Just respond supportively.
- If contextTag is "general_distress", do not guess at a specific cause.
- If noEmotionsDetected is true, no specific emotion was recognized in
  what the person wrote. Do NOT assume distress, sadness, or any
  negative state in this case. Respond with brief, warm, neutral
  acknowledgment instead (e.g. thanking them for checking in), and do
  not invent feelings they didn't express.
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
 * Cancels the currently active download/initialization process.
 */
export function cancelLocalAIDownload() {
  if (activeDownload) {
    if (activeDownload.cancelState) {
      activeDownload.cancelState.cancelled = true;
    }
  }
}

/**
 * Initializes the Local AI engine. Automatically routes to WebGPU (WebLLM)
 * if available, or falls back to WebAssembly CPU (Transformers.js) if not.
 */
export async function initLocalAI(onProgress, options = {}) {
  const tier = options.tier && MODEL_CATALOG[options.tier] ? options.tier : "medium";

  if (isReady && readyModelKey === tier) return engine || wasmEngine;
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
        const cpuModelId = MODEL_CATALOG[tier].cpuId;
        wasmEngine = await pipeline("text-generation", cpuModelId, {
          device: "wasm",
          dtype: "q4", // 4-bit quantized model for playable CPU performance
          progress_callback: (report) => {
            if (cancelState.cancelled) return;
            if (onProgress && report.status === "progress") {
              onProgress({
                progress: (report.progress || 0) / 100,
                text: `Downloading ${report.file || "weights"}…`,
              });
            }
          },
        });

        if (cancelState.cancelled) {
          if (wasmEngine.dispose) await wasmEngine.dispose();
          wasmEngine = null;
          throw new Error("cancelled");
        }
      }

      isReady = true;
      readyModelKey = tier;
      return engine || wasmEngine;
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
 */
export async function generateLocal(prompt) {
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
  } else if (wasmEngine) {
    const response = await wasmEngine(messages, {
      max_new_tokens: 120,
      temperature: 0.7,
      do_sample: true,
    });
    return response[0]?.generated_text?.at(-1)?.content ?? "";
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
  if (wasmEngine) {
    if (wasmEngine.dispose) await wasmEngine.dispose();
    wasmEngine = null;
  }
  isReady = false;
  readyModelKey = null;
  engineType = null;
}