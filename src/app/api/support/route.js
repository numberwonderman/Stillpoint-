/**
 * /api/support — Stillpoint
 *
 * Server-side proxy to Gemini for signed-in users.
 *
 * Flow:
 *   1. Auth gate — session cookie required.
 *   2. Rate limit.
 *   3. NOPE safety evaluation — if crisis, return crisis response immediately.
 *   4. Build conversation history and stream StillPoint response.
 *   5. In parallel, determine whether external resources are warranted
 *      via a lightweight intent check (generateObject).
 *   6. If resources are warranted, call NOPE Signpost and rank results
 *      through Gemini. Emit ranked cards over the stream.
 *   7. Send [DONE].
 *
 * Resources are only fetched when the intent check says they are genuinely
 * needed — not on every message.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateObject } from "ai";
import { z } from "zod";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import { evaluateSafety, signpostResources } from "@/lib/nope";
import { parseInput } from "@/lib/parser";
import { SYSTEM_INSTRUCTION } from "@/lib/prompt";
import {
  aiRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MODEL_NAME = "gemini-3.1-flash-lite";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const ResourceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  why: z.string().optional(),           // why this is relevant to the user
  phone: z.string().optional(),
  url: z.string().optional(),
  address: z.string().optional(),       // for map links
  availability: z.string().optional(),
  isCrisis: z.boolean().optional(),     // marks urgent/crisis resources
});

const IntentSchema = z.object({
  needsResources: z.boolean(),
  resourceQuery: z.string().optional(), // a search query for NOPE if resources needed
  reason: z.string().optional(),        // brief reason, for logging only
});

const RankedResourcesSchema = z.object({
  rankedResources: z.array(ResourceSchema),
});

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request) {
  // 1. Auth gate
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "You need to be signed in to use Stillpoint." },
      { status: 401 }
    );
  }

  // 2. Rate limit
  const limit = await aiRateLimit.limit(getRateLimitIdentifier(request));
  const limited = rateLimitResponse(limit);
  if (limited) return limited;

  // 3. Parse body
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

  // 4. NOPE safety gate
  let isCrisis = false;
  let severity = "elevated";
  let crisisResources = [];

  const safetyEval = await evaluateSafety(trimmed, body.history || []);
  if (safetyEval.isCrisis) {
    isCrisis = true;
    severity = safetyEval.severity || "elevated";
    crisisResources = safetyEval.matchedResources || [];
  } else {
    // Fallback to local parser if NOPE misses it or API is down
    const localEval = parseInput(trimmed);
    if (localEval.isCrisis) {
      isCrisis = true;
      severity = localEval.severity || "elevated";
    }
  }

  if (isCrisis) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Crisis Gate] Detected crisis. Severity: ${severity}`);
    }
    // Optionally enrich crisis response with NOPE signpost resources
    if (crisisResources.length === 0) {
      try {
        const signpostResults = await signpostResources({
          query: "crisis support",
          country: body.country || "US",
        });
        if (signpostResults && signpostResults.length > 0) {
          crisisResources = signpostResults.slice(0, 3).map((r) => ({
            ...r,
            isCrisis: true,
          }));
        }
      } catch {
        // best-effort, non-blocking
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Crisis Gate] Returning ${crisisResources.length} resources`);
    }
    return NextResponse.json(
      {
        isCrisis: true,
        severity: severity,
        resources: crisisResources,
      },
      { status: 200 }
    );
  }

  // 5. Verify Gemini API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cloud responses are temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });

  // 6. Build conversation messages
  const messages = [];
  if (Array.isArray(body.history)) {
    for (const msg of body.history) {
      if (
        msg &&
        typeof msg.text === "string" &&
        msg.text.trim() &&
        (msg.role === "user" || msg.role === "assistant" || msg.role === "model")
      ) {
        messages.push({
          role: (msg.role === "assistant" || msg.role === "model") ? "assistant" : "user",
          content: msg.text.trim(),
        });
      }
    }
  }
  messages.push({ role: "user", content: trimmed });

  // 7. Stream the StillPoint response, then conditionally fetch resources.
  try {
    const streamResult = streamText({
      model: google(MODEL_NAME),
      system: SYSTEM_INSTRUCTION,
      messages,
      temperature: 0.7,
      maxTokens: 250,
    });

    // Build a short context string for the post-stream intent check.
    const recentContext = messages
      .slice(-4)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Step A: stream the conversational response
          for await (const textChunk of streamResult.textStream) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`)
            );
          }

          // Step B: intent check — should we fetch resources?
          // Runs after the text stream completes to avoid API contention.
          let needsResources = false;
          let resourceQuery = trimmed;

          try {
            const intentResult = await generateObject({
              model: google(MODEL_NAME),
              schema: IntentSchema,
              prompt: `You are a support triage system. Given this conversation excerpt, decide whether the user would benefit from external support resources (therapy directories, helplines, support organisations, specific services).

Return needsResources: true ONLY when:
- The user explicitly asks for help finding support or resources
- The conversation clearly indicates a need for a specific external service
- A crisis or safety situation requires resource referral

Return needsResources: false for:
- General emotional venting or processing
- Normal difficult emotions that don't require external services
- Small talk or topic changes
- Requests for advice that StillPoint can answer conversationally

Conversation:
${recentContext}

If needsResources is true, also provide a concise resourceQuery (2-6 words) for searching relevant services.`,
            });
            needsResources = intentResult.object?.needsResources === true;
            resourceQuery = intentResult.object?.resourceQuery || trimmed;
            
            if (process.env.NODE_ENV !== "production") {
              console.log(`[Resource Intent] needsResources: ${needsResources}, query: "${resourceQuery}"`);
            }
          } catch (err) {
            // Intent check failure is non-fatal — skip resources.
            if (process.env.NODE_ENV !== "production") {
              console.error(`[Resource Intent] Error:`, err);
            }
          }

          // Step C: fetch and rank resources if needed
          if (needsResources) {
            try {
              const rawResources = await signpostResources({
                query: resourceQuery,
                country: body.country || "US",
              });
              
              if (process.env.NODE_ENV !== "production") {
                console.log(`[Signpost API] Returned ${rawResources ? rawResources.length : 0} resources`);
              }

              if (rawResources && rawResources.length > 0) {
                try {
                  const { object: rankedResult } = await generateObject({
                    model: google(MODEL_NAME),
                    schema: RankedResourcesSchema,
                    prompt: `User's message: "${trimmed}"

Resources returned by a support directory:
${JSON.stringify(rawResources, null, 2)}

Task: Select the 1-3 most relevant resources for this specific user situation. For each selected resource, write a brief "why" field (one sentence) explaining relevance. Preserve address fields when present. Return an empty array if no resources are genuinely relevant. Do NOT invent or modify phone numbers, URLs, or addresses.`,
                  });

                  const ranked = rankedResult?.rankedResources;
                  if (process.env.NODE_ENV !== "production") {
                    console.log(`[Gemini Ranking] Selected ${ranked ? ranked.length : 0} resources`);
                  }

                  if (ranked && ranked.length > 0) {
                    if (process.env.NODE_ENV !== "production") {
                      console.log(`[Response Payload] Enqueuing ${ranked.length} ranked resources`);
                    }
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ resources: ranked })}\n\n`
                      )
                    );
                  }
                } catch (err) {
                  // Ranking failed — emit top 2 raw as fallback.
                  if (process.env.NODE_ENV !== "production") {
                    console.error(`[Gemini Ranking] Error:`, err);
                  }
                  const fallback = rawResources.slice(0, 2);
                  if (fallback.length > 0) {
                    if (process.env.NODE_ENV !== "production") {
                      console.log(`[Response Payload] Enqueuing ${fallback.length} fallback resources`);
                    }
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ resources: fallback })}\n\n`)
                    );
                  }
                }
              }
            } catch (err) {
              // Signpost fetch failed — skip silently.
              if (process.env.NODE_ENV !== "production") {
                console.error(`[Signpost API] Error:`, err);
              }
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream Error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Cloud response failed unexpectedly." })}\n\n`
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
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("AI Generation Error", err);
    return NextResponse.json(
      { error: "Cloud response failed unexpectedly. Please try again." },
      { status: 502 }
    );
  }
}