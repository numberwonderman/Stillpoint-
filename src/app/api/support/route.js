/**
 * /api/support — Stillpoint
 *
 * Server-side proxy to Gemini for signed-in users.
 *
 * Flow:
 *   1. Auth gate.
 *   2. Rate limit.
 *   3. Normalize history + current message.
 *   4. Detect country from Vercel request metadata.
 *   5. NOPE safety evaluation (or local fallback) — see _lib/safety-gate.
 *   6. If crisis, return crisis resources immediately.
 *   7. Stream Gemini response, then run the resource pipeline — see _lib/resources.
 *   8. Send [DONE].
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";

import {
  AUTH_COOKIE_NAME,
  verifyAuthToken,
} from "@/lib/auth";

import {
  aiRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

import { SYSTEM_INSTRUCTION } from "@/lib/prompt";

import { MODEL_NAME, MAX_MESSAGE_LENGTH } from "./_lib/constants";
import { getRequestCountry } from "./_lib/country";
import {
  normalizeHistory,
  toAiMessages,
} from "./_lib/history";
import { runSafetyGate } from "./_lib/safety-gate";
import {
  detectResourceIntent,
  fetchAndStreamResources,
} from "./_lib/resources";

export const runtime = "nodejs";

export async function POST(request) {
  // ----- 1. Auth -----------------------------------------------------------
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(token);

  if (!payload) {
    return NextResponse.json(
      {
        error: "You need to be signed in to use Stillpoint.",
      },
      { status: 401 }
    );
  }

  // ----- 2. Rate limit -----------------------------------------------------
  const limit = await aiRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);

  if (limited) {
    return limited;
  }

  // ----- 3. Parse body + length check -------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const rawText =
    body && typeof body.text === "string" ? body.text : "";
  const trimmed = rawText.trim();

  if (!trimmed) {
    return NextResponse.json(
      {
        error:
          "Please enter how you're feeling before submitting.",
      },
      { status: 400 }
    );
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error:
          "That message is too long. Please shorten it and try again.",
      },
      { status: 413 }
    );
  }

  const skipCrisisGate = body?.skipCrisisGate === true;

  const safeHistory = normalizeHistory(body?.history);
  const conversation = [
    ...safeHistory,
    { role: "user", text: trimmed },
  ];

  // ----- 4. Country --------------------------------------------------------
  const country = getRequestCountry(request);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[Support] Country: ${country}, history: ${safeHistory.length}, total messages: ${conversation.length}`
    );
  }

  // ----- 5. Crisis gate ----------------------------------------------------
  let gate = { isCrisis: false };
  if (!skipCrisisGate) {
    gate = await runSafetyGate(conversation, country, trimmed);
  }

  if (gate.isCrisis) {
    return NextResponse.json(
      {
        isCrisis: true,
        severity: gate.severity,
        imminence: gate.imminence,
        resources: gate.crisisResources,
        country,
      },
      { status: 200 }
    );
  }

  // ----- 6. Gemini client --------------------------------------------------
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Cloud responses are temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const messages = toAiMessages(conversation);

  // ----- 7. Stream response ------------------------------------------------
  try {
    const streamResult = streamText({
      model: google(MODEL_NAME),
      system: SYSTEM_INSTRUCTION,
      messages,
      temperature: 0.7,
      maxTokens: 250,
    });

    const recentContext = messages
      .slice(-4)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 7a. Stream conversational response.
          for await (const textChunk of streamResult.textStream) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: textChunk })}\n\n`
              )
            );
          }

          // 7b. Decide whether external resources are needed.
          const { needsResources, resourceQuery } =
            await detectResourceIntent({
              google,
              recentContext,
              fallbackQuery: trimmed,
            });

          // 7c. Fetch + rank + stream resources.
          await fetchAndStreamResources({
            google,
            controller,
            encoder,
            trimmed,
            needsResources,
            resourceQuery,
            country,
          });

          // 7d. End SSE stream.
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          console.error("[Support Stream] Error:", error);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "Cloud response failed unexpectedly.",
              })}\n\n`
            )
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
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("AI Generation Error:", error);

    return NextResponse.json(
      {
        error:
          "Cloud response failed unexpectedly. Please try again.",
      },
      { status: 502 }
    );
  }
}
