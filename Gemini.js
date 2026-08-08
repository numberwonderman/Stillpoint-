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
 */

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
 * @throws {Error} on network failure, bad key, or malformed API response
 */
export async function getSupportiveResponse(summary, apiKey) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("Missing or invalid API key.");
  }
  validateSummaryShape(summary);

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(summary) }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 200,
    },
  };

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error("Network error contacting Gemini. Check your connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new Error("Your API key was rejected. Double-check it in settings.");
    }
    if (response.status === 429) {
      throw new Error("Rate limit reached. Please wait a moment and try again.");
    }
    throw new Error(`Gemini request failed (status ${response.status}).`);
  }

  const data = await response.json();
  return extractText(data);
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

function extractText(apiResponseData) {
  try {
    const text = apiResponseData.candidates[0].content.parts[0].text;
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
 * endpoint itself. If persistence across sessions is wanted later, that
 * needs its own explicit, opt-in design decision — not a default.
 */
