/**
 * /api/support — Stillpoint
 *
 * Server-side proxy to Gemini for signed-in users.
 *
 * Why this exists:
 *   - The Gemini API key lives ONLY on the server (GEMINI_API_KEY env var).
 *     No key ever reaches the browser, so users don't need to bring their
 *     own key — any signed-in user gets to use the cloud path.
 *   - The session cookie (set by /api/auth/login or /api/auth/signup) is
 *     the gatekeeper: only authenticated users may call this route.
 *   - This route only ever receives the *structured* summary from
 *     parser.js, never raw user text — see the privacy contract in
 *     useStillpoint.js.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenAI } from "@google/genai";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

export const runtime = "nodejs";

const MODEL_NAME = "gemini-3.1-flash-lite";

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
- If noEmotionsDetected is true, no specific emotion was recognized in
  what the person wrote. Do NOT assume distress, sadness, or any
  negative state in this case. Respond with brief, warm, neutral
  acknowledgment instead (e.g. thanking them for checking in), and do
  not invent feelings they didn't express.
`.trim();

export async function POST(request) {
  // 1. Auth gate — refuse anything that isn't a logged-in session.
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "You need to be signed in to use Stillpoint." },
      { status: 401 }
    );
  }

  // 2. Parse the JSON body, which must be a structured summary from parser.js.
  let summary;
  try {
    summary = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    validateSummaryShape(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Malformed summary." },
      { status: 400 }
    );
  }

  // 3. Pull the server-held key. If it's missing, the deploy is misconfigured.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Don't echo the env-var name to the user; just surface a clear failure.
    return NextResponse.json(
      { error: "Cloud responses are temporarily unavailable. Please try Local AI mode." },
      { status: 503 }
    );
  }

  // 4. Call Gemini. The client is constructed per-request so we never hold
  //    a long-lived object referencing the key across calls.
  const ai = new GoogleGenAI({ apiKey });
  const geminiRequest = {
    model: MODEL_NAME,
    contents: JSON.stringify(summary),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      maxOutputTokens: 200,
    },
  };

  let response;
  try {
    response = await ai.models.generateContent(geminiRequest);
  } catch (err) {
    if (err && err.status === 429) {
      // Free-tier rate limits are tight; one short retry resolves most
      // momentary throttling without the user having to retry manually.
      await sleep(1500);
      try {
        response = await ai.models.generateContent(geminiRequest);
      } catch (retryErr) {
        return NextResponse.json(
          { error: mapGeminiError(retryErr) },
          { status: 502 }
        );
      }
    } else {
      return NextResponse.json({ error: mapGeminiError(err) }, { status: 502 });
    }
  }

  let text;
  try {
    const candidate = response && response.text;
    if (typeof candidate !== "string" || !candidate.trim()) {
      throw new Error("empty");
    }
    text = candidate.trim();
  } catch {
    return NextResponse.json(
      { error: "Gemini returned an unexpected response format." },
      { status: 502 }
    );
  }

  return NextResponse.json({ text }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function mapGeminiError(err) {
  const status = err && typeof err.status === "number" ? err.status : undefined;

  if (status === 400 || status === 401 || status === 403) {
    return "Cloud responses are temporarily unavailable. Please try again shortly.";
  }
  if (status === 429) {
    return "Rate limit reached. Please wait a moment and try again.";
  }
  if (typeof status === "number") {
    return `Gemini request failed (status ${status}).`;
  }

  const msg = err && typeof err.message === "string" ? err.message.toLowerCase() : "";
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused")
  ) {
    return "Network error contacting Gemini. Check your connection and try again.";
  }

  return "Cloud response failed unexpectedly. Please try again.";
}