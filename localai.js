// localai.js
// Stillpoint — optional "Local AI mode" using WebLLM (in-browser, no server round-trip)
// Stretch goal, non-blocking: falls back gracefully to Gemini.js if unsupported or unloaded.
// No build step — loaded via CDN ESM import, consistent with Gemini.js.

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// Pin a small, quantized model suitable for emotion-matched filler responses.
// Swap this string if you land on a different model after testing browser memory limits.
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLK";

let engine = null;
let isLoading = false;
let isReady = false;

/**
 * Checks whether the current browser can plausibly run WebLLM (WebGPU required).
 */
export function isLocalAISupported() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * Lazily initializes the WebLLM engine. Safe to call multiple times.
 * @param {(report: object) => void} onProgress - optional callback for load progress UI
 */
export async function initLocalAI(onProgress) {
  if (isReady || isLoading) return engine;
  if (!isLocalAISupported()) {
    throw new Error("WebGPU not available — Local AI mode unsupported in this browser.");
  }

  isLoading = true;
  try {
    engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report) => {
        if (onProgress) onProgress(report);
      },
    });
    isReady = true;
    return engine;
  } finally {
    isLoading = false;
  }
}

export function isLocalAIReady() {
  return isReady;
}

/**
 * Generates a short, emotion-matched filler response entirely on-device.
 * Intended to bridge the gap while a slower/cloud call (Gemini) resolves,
 * or to run standalone when Local AI mode is toggled on.
 * @param {string} prompt - structured, already-parsed input (never raw sensitive text)
 */
export async function generateLocal(prompt) {
  if (!isReady) {
    throw new Error("Local AI engine not initialized. Call initLocalAI() first.");
  }

  const response = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: 60,
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Tears down the engine to free memory (e.g., when toggling Local AI mode off).
 */
export async function unloadLocalAI() {
  if (engine) {
    await engine.unload();
    engine = null;
  }
  isReady = false;
}
