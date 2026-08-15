// Stillpoint — optional "Local AI mode" using WebLLM (in-browser, no server round-trip)
// Stretch goal, non-blocking: falls back gracefully to gemini.js if unsupported or unloaded.
// Installed via pnpm (`@mlc-ai/web-llm`); no CDN, no build-time shim needed.

import * as webllm from "@mlc-ai/web-llm";

// Pin a small, quantized model suitable for emotion-matched filler responses.
// Swap this string if you land on a different model after testing browser memory limits.
const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

let engine = null;
let isLoading = false;
let isReady = false;

// Mirrors gemini.js's SYSTEM_INSTRUCTION so behavior is consistent
// regardless of which provider answered. Small models like this one
// default to describing themselves and narrating the input ("Based on
// the JSON object you provided...") unless explicitly told not to.
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
- If contextTag is "general_distress", do not guess at a specific cause. - If noEmotionsDetected is true, no specific emotion was recognized in
  what the person wrote. Do NOT assume distress, sadness, or any
  negative state in this case. Respond with brief, warm, neutral
  acknowledgment instead (e.g. thanking them for checking in), and do
  not invent feelings they didn't express.
`.trim();

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
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 120,
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
