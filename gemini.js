/**
 * gemini.js — Stillpoint
 *
 * The ONLY file that talks to the network. It receives the structured
 * summary produced by parser.js (never raw user text) and sends it to
 * Gemini using a key the user supplies themselves (BYOK — bring your
 * own key). The key is held in memory only; see note at bottom.
 *
 * This module must never be called if parser.js returned
 * { isCrisis: true } — that path is handled entirely locally in app.js.
 *
 * Network transport is handled by Google's official @google/genai SDK
 * (npm install @google/genai). This file does not construct REST URLs,
 * headers, or request bodies by hand — the SDK owns that.
 */

import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = "gemini-2.0-flash";

const SYSTEM_INSTRUCTION = `
You are a supportive, grounding presence for someone who is having a
difficult emotional moment. You will receive only a small structured
summary — never the person's own words — describing broad emotion
categories, an intensity level, any emotions they explicitly said they
do NOT feel, and a general context tag.

Rules you must follow:
- Do not diagnose, label, or speculate about any mental health condition.
- Do not give medical, clinical, or crisis advice — a separate local
  system already handles crisis situations before you are ever called.
- Keep your response short: 2-4 sentences.
- Be warm and validating without being clinical or generic.
- Do not ask the person to describe their situation further; respond to
  what's already summarized.
- Do not reference "the data I was given" or the structured summary
  itself — respond as if naturally supporting a person, not analyzing
  a data payload.
- If contextTag is "general_distress", do not guess at a specific cause.
`.trim();

/**
 * Sends the structured summary to Gemini and returns a short supportive
 * response string.
 *
 * @param {{emotions: string[], intensity: string, negated: string[], contextTag: string}} summary
 * @param {string} apiKey - user-supplied Gemini API key (BYOK)
 * @returns {Promise<string>} supportive response text
 * @throws {Error} on SDK/network failure, bad key, or malformed API response
 */
export async function getSupportiveResponse(summary, apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("Missing or invalid API key.");
  }
  validateSummaryShape(summary);

  // The SDK client is constructed fresh from the in-memory, user-supplied
  // key for each call. Nothing about the key is written to disk, storage,
  // or logs here — see the note at the bottom of this file.
  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: JSON.stringify(summary),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    });
  } catch (err) {
    throw new Error(mapSdkErrorMessage(err));
  }

  return extractText(response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateSummaryShape(summary) {
  if (!summary || typeof summary !== "object") {
    throw new Error("Structured summary is missing.");
  }
  const requiredKeys = ["emotions", "intensity", "negated", "contextTag"];
  for (const key of requiredKeys) {
    if (!(key in summary)) {
      throw new Error(`Structured summary is missing required field: ${key}`);
    }
  }
  if (!Array.isArray(summary.emotions) || !Array.isArray(summary.negated)) {
    throw new Error("Structured summary fields are malformed.");
  }
}

/**
 * Turns an error thrown by the SDK into a safe, user-facing message.
 * Never includes the API key or any raw request/response payload.
 */
function mapSdkErrorMessage(err) {
  // The SDK's ApiError exposes an HTTP-style status code.
  const status = err && typeof err.status === "number" ? err.status : undefined;

  if (status === 400 || status === 401 || status === 403) {
    return "Your API key was rejected. Double-check it in settings.";
  }
  if (status === 429) {
    return "Rate limit reached. Please wait a moment and try again.";
  }
  if (typeof status === "number") {
    return `Gemini request failed (status ${status}).`;
  }

  // Fall back to sniffing common network-failure signatures without
  // echoing the underlying error object (which could, in principle,
  // contain the request details).
  const msg = err && typeof err.message === "string" ? err.message.toLowerCase() : "";
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("enotfound") || msg.includes("econnrefused")) {
    return "Network error contacting Gemini. Check your connection and try again.";
  }

  return "Gemini request failed unexpectedly. Please try again.";
}

function extractText(response) {
  try {
    const text = response.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("empty");
    }
    return text.trim();
  } catch {
    throw new Error("Gemini returned an unexpected response format.");
  }
}

/**
 * NOTE on key storage:
 * Per Stillpoint's privacy model, the API key should live only in memory
 * (a JS variable / React state) for the duration of the session — never
 * localStorage/sessionStorage, and never sent anywhere but the Gemini
 * API itself (now via the official @google/genai SDK). If persistence
 * across sessions is wanted later, that needs its own explicit, opt-in
 * design decision — not a default.
 */
