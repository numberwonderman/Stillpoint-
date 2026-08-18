/**
 * /api/support — Stillpoint
 *
 * Server-side proxy to Gemini for signed-in users.
 *
 * Flow:
 *   - The session cookie (set by /api/auth/login or /api/auth/signup) is
 *     the gatekeeper: authenticated users may call this route.
 *   - The route enforces a mandatory Crisis Gate first using parser.js.
 *     If crisis signals are detected, Gemini is never called and crisis
 *     resources are returned immediately.
 *   - If no crisis signals trip, the original message (and recent conversation
 *     context from session storage) is sent directly to Gemini.
 *   - Messages are not stored in any database and are not linked to user identity.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GoogleGenAI } from "@google/genai";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import { parseInput } from "@/lib/parser";
import {
  aiRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MODEL_NAME = "gemini-3.1-flash-lite";

const SYSTEM_INSTRUCTION = `
You are a supportive, grounding presence for someone who is having a
difficult emotional moment. You receive their message directly after a safety
crisis gate check has confirmed they are not in immediate danger.

Rules you must follow:
- Do not diagnose, label, or speculate about any mental health condition.
- Do not give medical, clinical, or crisis advice — a separate system already
  handles crisis situations before you are ever called.
- Keep your response concise: 2-4 warm, grounded sentences.
- Be validating, supportive, and empathetic without being clinical or generic.
- Do not ask intrusive questions; offer thoughtful, present, and compassionate responses.
- If conversation history is provided, maintain context naturally as a caring conversation partner.
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

  // 1b. Rate-limit after auth, before any Gemini work.
  const limit = await aiRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // 2. Parse the JSON body: text and optional history.
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawText = body && typeof body.text === "string" ? body.text : "";
  const trimmed = rawText.trim();
  if (!trimmed) {
    return NextResponse.json(
      { error: "Please enter how you're feeling before submitting." },
      { status: 400 }
    );
  }
  if (trimmed.length > 4000) {
    return NextResponse.json(
      { error: "That message is too long. Please shorten it and try again." },
      { status: 413 }
    );
  }

  // 3. Mandatory Crisis Gate — evaluated on every request before calling Gemini.
  const parsed = parseInput(trimmed);
  if (parsed.isCrisis) {
    return NextResponse.json(
      { isCrisis: true, severity: parsed.severity || "elevated" },
      { status: 200 }
    );
  }

  // 4. Pull the server-held key.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cloud responses are temporarily unavailable. Please try Local AI mode." },
      { status: 503 }
    );
  }

  // 5. Construct conversation contents (history + current message) for Gemini.
  const contents = [];
  if (Array.isArray(body.history)) {
    for (const msg of body.history) {
      if (
        msg &&
        typeof msg.text === "string" &&
        msg.text.trim() &&
        (msg.role === "user" || msg.role === "assistant" || msg.role === "model")
      ) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.text.trim() }],
        });
      }
    }
  }

  contents.push({
    role: "user",
    parts: [{ text: trimmed }],
  });

  // 6. Call Gemini via streaming API.
  const ai = new GoogleGenAI({ apiKey });
  const geminiRequest = {
    model: MODEL_NAME,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      maxOutputTokens: 200,
    },
  };

  let responseStream;
  try {
    responseStream = await ai.models.generateContentStream(geminiRequest);
  } catch (err) {
    if (err && err.status === 429) {
      await sleep(1500);
      try {
        responseStream = await ai.models.generateContentStream(geminiRequest);
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of responseStream) {
          const textChunk = chunk.text;
          if (textChunk) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: mapGeminiError(err) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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