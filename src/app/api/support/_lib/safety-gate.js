/**
 * Crisis safety gate.
 *
 * Order of operations:
 *   1. Try the NOPE safety API. If it returns a usable verdict,
 *      trust it.
 *   2. If NOPE is unavailable, fall back to the local keyword
 *      parser (`parseInput`) so we never let a crisis through
 *      just because the upstream failed.
 *   3. If a crisis is detected and NOPE didn't already attach
 *      resources, ask signpost for top-3 crisis resources so
 *      the client always has something concrete to show.
 *
 * Returns a plain object that the route handler turns into a
 * `NextResponse.json(...)` payload.
 */

import { evaluateSafety, signpostResources } from "@/lib/nope";
import { parseInput } from "@/lib/parser";
import { hasResources, toNopeMessages } from "./history";

/**
 * @param {Array<{role: string, text: string}>} conversation
 * @param {string} country  ISO-3166 alpha-2 country code
 * @param {string} trimmed  the user's current message
 * @returns {Promise<{
 *   isCrisis: boolean,
 *   severity: string,
 *   imminence: string,
 *   crisisResources: any[],
 *   safetyEvaluationAvailable: boolean,
 * }>}
 */
export async function runSafetyGate(conversation, country, trimmed) {
  let isCrisis = false;
  let severity = "none";
  let imminence = "not_applicable";
  let crisisResources = [];
  let safetyEvaluationAvailable = true;

  let startIndex = 0;
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].crisisAcknowledged) {
      startIndex = i + 1;
      break;
    }
  }

  const relevantConversation = conversation.slice(startIndex);
  const nopeMessages = toNopeMessages(relevantConversation);

  const safetyEval = await evaluateSafety(nopeMessages, country);

  if (safetyEval && safetyEval.evaluationAvailable === true) {
    isCrisis = safetyEval.isCrisis === true;
    severity = safetyEval.severity || "none";
    imminence = safetyEval.imminence || "not_applicable";
    crisisResources = Array.isArray(safetyEval.matchedResources)
      ? safetyEval.matchedResources
      : [];
  } else {
    safetyEvaluationAvailable = false;

    try {
      const localEval = parseInput(trimmed);

      if (localEval?.isCrisis === true) {
        isCrisis = true;
        severity = localEval.severity || "elevated";
      }
    } catch (error) {
      console.error("[Local Safety Parser] Error:", error);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[Crisis Gate]", {
      isCrisis,
      severity,
      imminence,
      safetyEvaluationAvailable,
      crisisResourceCount: crisisResources.length,
    });
  }

  if (isCrisis && !hasResources(crisisResources)) {
    try {
      const signpostResults = await signpostResources({
        query: "crisis support",
        country,
      });

      if (Array.isArray(signpostResults) && signpostResults.length > 0) {
        crisisResources = signpostResults
          .slice(0, 3)
          .map((resource) => ({
            ...resource,
            isCrisis: true,
          }));
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Crisis Gate] Signpost enrichment failed:", error);
      }
    }
  }

  return {
    isCrisis,
    severity,
    imminence,
    crisisResources,
    safetyEvaluationAvailable,
  };
}
