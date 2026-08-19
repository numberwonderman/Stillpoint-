/**
 * /api/support — Stillpoint
 *
 * Server-side proxy to Gemini for signed-in users.
 *
 * Flow:
 *   - The session cookie (set by /api/auth/login or /api/auth/signup) is
 *     the gatekeeper: authenticated users may call this route.
 *   - The route enforces a mandatory Crisis Gate first using NOPE API.
 *     If crisis signals are detected, Gemini is never called and crisis
 *     resources are returned immediately.
 *   - If no crisis signals trip, the original message (and recent conversation
 *     context from session storage) is sent directly to Gemini.
 *   - Messages are not stored in any database and are not linked to user identity.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateObject } from "ai";
import { z } from "zod";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";
import { evaluateSafety, signpostResources } from "@/lib/nope";
import { SYSTEM_INSTRUCTION } from "@/lib/prompt";
import {
  aiRateLimit,
  getRateLimitIdentifier,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const MODEL_NAME = "gemini-3.1-flash-lite";

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

  // 1b. Rate-limit after auth, before any AI work.
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

  // 3. NOPE API Safety Gate — evaluated on every request before calling Gemini.
  // The client also passes a 'useLocalModel' flag if it wants a local fallback.
  const useLocalModel = body.useLocalModel === true;

  // Run the safety evaluation through NOPE API
  const safetyEval = await evaluateSafety(trimmed, body.history || []);
  if (safetyEval.isCrisis) {
    return NextResponse.json(
      { 
        isCrisis: true, 
        severity: safetyEval.severity || "elevated",
        resources: safetyEval.matchedResources || []
      },
      { status: 200 }
    );
  }

  // If local model is requested, we don't hit the cloud AI.
  if (useLocalModel) {
    // For local model fallback without overloading it, we provide a static list of steps
    // that guide the user on fetching their own resources manually, acknowledging the limitations.
    return NextResponse.json({
      localFallback: true,
      text: "You are currently using Local AI Mode. The cloud conversational model is not active. If you need support resources, please follow these steps:\n\n1. Identify what type of support you are seeking (e.g., counseling, crisis, community).\n2. Visit trusted directories in your region.\n3. Consider contacting a professional directly.",
      warning: "No cloud model was used. This is a local static fallback."
    });
  }

  // 4. Pull the server-held key.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Cloud responses are temporarily unavailable. Please try Local AI mode." },
      { status: 503 }
    );
  }

  // Instantiate Google provider with the explicit key (avoids requiring GOOGLE_GENERATIVE_AI_API_KEY).
  const google = createGoogleGenerativeAI({ apiKey });

  // 5. Construct conversation messages for Vercel AI SDK.
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

  messages.push({
    role: "user",
    content: trimmed,
  });

  try {
    // Using Vercel AI SDK to stream text
    const result = streamText({
      model: google(MODEL_NAME),
      system: SYSTEM_INSTRUCTION,
      messages: messages,
      temperature: 0.7,
      maxTokens: 200,
    });
    
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream the text chunks
          for await (const textChunk of result.textStream) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`)
            );
          }
          
          // After text generation, check for signpost resources
          const rawResources = await signpostResources({ query: trimmed, country: "US" });
          if (rawResources && rawResources.length > 0) {
            try {
              const { object: rankedResult } = await generateObject({
                model: google(MODEL_NAME), // uses the same keyed instance
                schema: z.object({
                  rankedResources: z.array(z.object({
                    name: z.string(),
                    description: z.string().optional(),
                    phone: z.string().optional(),
                    url: z.string().optional(),
                    actionUrl: z.string().optional(),
                    availability: z.string().optional()
                  }))
                }),
                prompt: `User message: "${trimmed}"\n\nRaw resources from search:\n${JSON.stringify(rawResources)}\n\nFilter and rank these resources from most relevant to least relevant to the user's situation. Only include resources that are actually helpful for their specific context.`
              });

              if (rankedResult.rankedResources && rankedResult.rankedResources.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ resources: rankedResult.rankedResources })}\n\n`)
                );
              }
            } catch (rankingErr) {
              console.error("Resource ranking failed", rankingErr);
              // Fallback to raw resources if ranking fails
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ resources: rawResources })}\n\n`)
              );
            }
          }
          
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("Stream Error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Cloud response failed unexpectedly." })}\n\n`)
          );
        } finally {
          controller.close();
        }
      }
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