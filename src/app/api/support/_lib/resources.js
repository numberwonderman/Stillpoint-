

import { generateObject } from "ai";
import { signpostResources } from "@/lib/nope";
import { MODEL_NAME } from "./constants";
import { IntentSchema, RankedResourcesSchema } from "./schemas";
import { normalizeResourceQuery } from "./history";

const TRIAGE_PROMPT = `
You are a support triage system.

Given this conversation excerpt, decide whether the user would benefit from external support resources such as therapy directories, helplines, support organisations, or specific services.

Return needsResources: true ONLY when:
- The user explicitly asks for help finding support or resources.
- The conversation clearly indicates a need for a specific external service.
- A crisis or safety situation requires resource referral.

Return needsResources: false for:
- General emotional venting or processing.
- Normal difficult emotions that do not require an external service.
- Small talk or topic changes.
- Requests for advice that StillPoint can answer conversationally.

Conversation:
{{recentContext}}

If needsResources is true, also provide:
resourceQuery: a concise 2-6 word search query.

Do not provide unnecessary commentary.
  `.trim();

const RANKING_PROMPT = `
User's message:
"{{trimmed}}"

Resources returned by a support directory:
{{rawResourcesJson}}

Task:
Select the 1-3 most relevant resources for this specific user situation.

For each selected resource:
- Preserve the original name.
- Preserve phone numbers exactly.
- Preserve URLs exactly.
- Preserve addresses exactly.
- Add a brief "why" field of one sentence explaining relevance.

Do NOT invent, alter, normalize, or fabricate:
- phone numbers
- URLs
- addresses
- organization names

Return an empty array if none are genuinely relevant.
  `.trim();

/**
 * Decide whether the conversation warrants resource referral.
 * Non-fatal: any error returns `{ needsResources: false }`.
 */
export async function detectResourceIntent({
  google,
  recentContext,
  fallbackQuery,
}) {
  let needsResources = false;
  let resourceQuery = fallbackQuery;

  try {
    const intentResult = await generateObject({
      model: google(MODEL_NAME),
      schema: IntentSchema,
      prompt: TRIAGE_PROMPT.replace("{{recentContext}}", recentContext),
    });

    needsResources = intentResult.object?.needsResources === true;
    resourceQuery = normalizeResourceQuery(
      intentResult.object?.resourceQuery,
      fallbackQuery
    );

    if (process.env.NODE_ENV !== "production") {
      console.log("[Resource Intent]", { needsResources, resourceQuery });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Resource Intent] Error:", error);
    }
  }

  return { needsResources, resourceQuery };
}

/**
 * Ask Gemini to pick 1-3 of the most relevant resources for the
 * current message. Falls back to the first 2 raw resources if
 * ranking fails, so the user always gets *something*.
 *
 * @returns {Promise<any[]>} ranked (or fallback) resource list
 */
export async function rankResources({ google, trimmed, rawResources }) {
  try {
    const { object: rankedResult } = await generateObject({
      model: google(MODEL_NAME),
      schema: RankedResourcesSchema,
      prompt: RANKING_PROMPT
        .replace("{{trimmed}}", trimmed)
        .replace(
          "{{rawResourcesJson}}",
          JSON.stringify(rawResources, null, 2)
        ),
    });

    const ranked = rankedResult?.rankedResources;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[Gemini Ranking] Selected ${
          Array.isArray(ranked) ? ranked.length : 0
        } resources`
      );
    }

    if (Array.isArray(ranked) && ranked.length > 0) {
      return ranked.slice(0, 3);
    }

    return [];
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Gemini Ranking] Error:", error);
    }
    return rawResources.filter(Boolean).slice(0, 2);
  }
}

/**
 * Signpost → rank → SSE. No-op if `needsResources` is false.
 * Any signpost failure is logged but doesn't fail the stream.
 */
export async function fetchAndStreamResources({
  google,
  controller,
  encoder,
  trimmed,
  needsResources,
  resourceQuery,
  country,
}) {
  if (!needsResources) {
    return;
  }

  try {
    const rawResources = await signpostResources({
      query: resourceQuery,
      country,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[Signpost] Returned ${
          Array.isArray(rawResources) ? rawResources.length : 0
        } resources`
      );
    }

    if (!Array.isArray(rawResources) || rawResources.length === 0) {
      return;
    }

    const ranked = await rankResources({ google, trimmed, rawResources });

    if (ranked.length > 0) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ resources: ranked })}\n\n`
        )
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[Signpost API] Error:", error);
    }
  }
}
