/**
 * parser.js — Stillpoint
 *
 * Turns raw user text into a minimal structured summary. Pure and
 * synchronous — no I/O, no network. Used in two places:
 *
 *   1. The browser (useStillpoint.js) — runs the crisis gate on the raw
 *      text before either branch (cloud or local AI) is taken, so a
 *      person who needs immediate help gets local resources even if
 *      they aren't signed in or the network is down.
 *   2. The server (app/api/support/route.js) — runs the full parser
 *      on the raw text from the cloud path. The structured output is
 *      what Gemini receives; the raw text is held only for the
 *      request's duration and is never logged or persisted.
 *
 * The local-AI path also runs the crisis gate here before feeding raw
 * text directly to the on-device model. parser.js never talks to a
 * network — it only reads from lexicon.js and returns a plain object.
 *
 * Flow (strictly linear, fail-safe):
 *   1. Crisis gate (first, always, ignores negation). The gate is a
 *      multi-signal scorer: it adds up the weights of every phrase
 *      and pattern that matches, then maps the total to a severity
 *      tier ("elevated" | "high" | "imminent"). Any match at all is
 *      treated as a crisis — the tier only changes how the UI frames
 *      the response.
 *   2. Sentence/token split
 *   3. Emotion + negation + intensity + context matching
 *   4. Output assembly
 */

import {
  CRISIS_SIGNALS,
  CRISIS_PATTERNS,
  CRISIS_SEVERITY_THRESHOLDS,
  CRISIS_TERMS,
  EMOTION_BUCKETS,
  INTENSITY_MODIFIERS,
  NEGATION_TERMS,
  CONTEXT_TAGS,
} from "./lexicon.js";

const INTENSITY_RANK = { low: 1, moderate: 2, high: 3 };
const NEGATION_WINDOW = 3; // max tokens a negation can precede an emotion word by

/**
 * Public entry point.
 * @param {string} rawText - unmodified user input
 * @returns {{isCrisis: true, severity: string, matchedCategories: string[]} | {emotions: string[], intensity: string, negated: string[], contextTag: string, noEmotionsDetected: boolean}}
 */
export function parseInput(rawText) {
  const normalized = normalize(rawText);

  // --- Step 1: Crisis gate — checked first, ignores negation entirely.
  // Multi-signal scorer: returns { matched, severity, categories } if
  // anything fires. Over-inclusion is safe here; under-inclusion is not.
  const crisis = detectCrisis(normalized);
  if (crisis.matched) {
    return {
      isCrisis: true,
      severity: crisis.severity,
      matchedCategories: crisis.categories,
    };
  }

  // --- Step 2: Split into sentences (negation must not cross a sentence
  // boundary), then tokenize each sentence into words.
  const sentences = splitSentences(normalized);
  const sentenceTokens = sentences.map(tokenize);

  // --- Step 3: Walk each sentence, matching emotions/negation/intensity.
  const emotions = new Set();
  const negated = new Set();
  let highestIntensityRank = 0; // 0 = none found yet

  for (const tokens of sentenceTokens) {
    matchEmotions(tokens, emotions, negated);
    const intensityFound = highestIntensityIn(tokens);
    if (intensityFound && INTENSITY_RANK[intensityFound] > highestIntensityRank) {
      highestIntensityRank = INTENSITY_RANK[intensityFound];
    }
  }

  const intensity = highestIntensityRank
    ? Object.keys(INTENSITY_RANK).find((k) => INTENSITY_RANK[k] === highestIntensityRank)
    : "moderate"; // default when no modifier is present

  const contextTag = matchContextTag(normalized);

  // --- Step 4: Output assembly — minimal schema, no raw text.
  // noEmotionsDetected distinguishes "we recognized nothing in the lexicon"
  // from genuine unspecified distress. Without this flag, both cases
  // collapse into contextTag: "general_distress" with an empty emotions
  // array, and a downstream model (especially a small local one) may
  // interpret the ambiguity as license to invent negative emotions rather
  // than staying neutral. See: local-mode mismatch, Aug 2026.
  return {
    emotions: [...emotions],
    intensity,
    negated: [...negated],
    contextTag,
    noEmotionsDetected: emotions.size === 0,
  };
}

// ---------------------------------------------------------------------------
// Crisis gate
// ---------------------------------------------------------------------------

/**
 * Escape a string for use inside a RegExp.
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a word-boundary RegExp for a multi-word phrase. The phrase may
 * contain internal spaces; we require a non-word boundary at each end
 * so "want to die" matches "I want to die" but NOT "I don't want to
 * diet" (where "die" is a stem of "diet"). Apostrophes inside the
 * phrase are tolerated ("can't go on") because the input has already
 * been apostrophe-stripped by `stripApostrophes`.
 *
 * @param {string} phrase
 * @returns {RegExp}
 */
function phraseRegex(phrase) {
  const escaped = escapeRegex(phrase.trim());
  // (?<![A-Za-z0-9])  negative lookbehind — left boundary
  // (?![A-Za-z0-9])   negative lookahead  — right boundary
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

/**
 * Run the multi-signal crisis gate. Returns:
 *   { matched: false } if nothing fires,
 *   { matched: true, severity, categories, score } otherwise.
 *
 * The scorer walks every CRISIS_SIGNALS group (phrases) and every
 * CRISIS_PATTERNS entry (regex), summing weights. A single match is
 * enough to trip the gate; severity is determined by the total score
 * (with an automatic floor of "high" if a plan/intent phrase hits).
 *
 * @param {string} normalizedText — already lowercased + trimmed
 * @returns {{matched: boolean, severity?: string, categories?: string[], score?: number}}
 */
function detectCrisis(normalizedText) {
  // Pre-strip apostrophes so contractions ("don't", "i'm") match the
  // lexicon's stripped form. Also collapse whitespace so multi-word
  // phrases separated by newlines still hit.
  const stripped = stripApostrophes(normalizedText).replace(/\s+/g, " ");

  let score = 0;
  const categories = new Set();
  let matched = false;

  // Soft-group rule bookkeeping:
  //   softHits  — categories from the soft self_harm_soft group that fired.
  //   demoted   — categories named by a CRISIS_PATTERNS entry's `demotes`
  //               field that fired.
  // A soft_harm_soft hit by itself does NOT trip the gate unless another
  // non-soft, non-hedge category has also fired. This is what makes
  // "I feel like hurting myself" pass through while "I'm cutting myself
  // right now" still trips.
  const softHits = new Set();
  const demoted = new Set();

  // 1) Phrase-based signals — word-boundary matched for safety.
  for (const group of Object.values(CRISIS_SIGNALS)) {
    const isSoftGroup = group.category === "self_harm_soft";
    for (const phrase of group.phrases) {
      if (phraseRegex(phrase).test(stripped)) {
        matched = true;
        categories.add(group.category);
        if (isSoftGroup) {
          // Record the soft hit but do NOT add its weight yet — see the
          // soft-group rule below.
          softHits.add(group.category);
        } else {
          score += group.weight;
        }
        // Don't break — multiple matches across categories raise severity.
      }
    }
  }

  // 2) Pattern-based signals — regexes for shapes the phrase list can't
  // catch (e.g. "i'm gonna [verb] myself"). Run on the stripped text so
  // contractions behave the same as the phrase list. Also pick up any
  // `demotes` array the entry declares — these suppress the named
  // soft-group categories (used by the hedging patterns in lexicon.js).
  for (const entry of CRISIS_PATTERNS) {
    const { pattern, weight, category } = entry;
    if (pattern.test(stripped)) {
      matched = true;
      categories.add(category);
      score += weight;
      if (Array.isArray(entry.demotes)) {
        for (const c of entry.demotes) demoted.add(c);
      }
    }
  }

  // 3) Soft-group rule.
  //
  // If a self_harm_soft phrase matched but no other non-soft, non-hedge
  // category has fired, and the soft category was not demoted by a
  // CRISIS_PATTERNS `demotes` entry, the gate does NOT trip. This is
  // the core fix for the false-positive on "I feel like hurting myself"
  // and similar hedging phrasings.
  //
  // If a non-soft category DID fire (e.g. means, intent, plan, active
  // self_harm, ideation, etc.) we treat the soft hit as an additional
  // signal: it contributes its weight to the score so severity can
  // still rise. If the soft category was demoted by a hedge pattern,
  // it contributes nothing regardless.
  let hasNonSoftHit = false;
  for (const cat of categories) {
    if (cat !== "self_harm_soft" && !cat.endsWith("_hedge")) {
      hasNonSoftHit = true;
      break;
    }
  }

  if (matched && softHits.size > 0 && !hasNonSoftHit) {
    // Suppress: nothing here is a real crisis signal. Soft self-harm
    // framings ("I feel like hurting myself", "the idea of self-harm",
    // "I'm not actually going to...") on their own do not trip the gate.
    return { matched: false };
  }

  // Soft hits co-firing with a real signal: add their weight now, but
  // not if the soft category was demoted by a CRISIS_PATTERNS rule.
  if (softHits.size > 0 && !demoted.has("self_harm_soft")) {
    score += 1; // self_harm_soft weight
  }

  if (!matched) {
    return { matched: false };
  }

  // --- Severity mapping ----------------------------------------------------
  // Thresholds: elevated >= 2, high >= 5, imminent >= 9.
  // We also force-floor to "high" if a plan/intent category matched —
  // those are intrinsically higher-stakes than raw ideation phrases.
  let severity = "elevated";
  if (score >= CRISIS_SEVERITY_THRESHOLDS.imminent) {
    severity = "imminent";
  } else if (score >= CRISIS_SEVERITY_THRESHOLDS.high) {
    severity = "high";
  } else if (score >= CRISIS_SEVERITY_THRESHOLDS.elevated) {
    severity = "elevated";
  }
  if (
    severity === "elevated" &&
    (categories.has("plan") || categories.has("intent"))
  ) {
    severity = "high";
  }

  return {
    matched: true,
    severity,
    categories: [...categories],
    score,
  };
}

/**
 * Back-compat helper. Returns true if the legacy flat CRISIS_TERMS list
 * would have caught the text. Kept for any caller (or test) that still
 * expects the old binary answer.
 *
 * @param {string} normalizedText
 * @returns {boolean}
 */
function containsCrisisTerm(normalizedText) {
  const stripped = stripApostrophes(normalizedText).replace(/\s+/g, " ");
  return CRISIS_TERMS.some((term) => phraseRegex(term).test(stripped));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(text) {
  return text.toLowerCase().trim();
}

function stripApostrophes(text) {
  return text.replace(/['’]/g, "");
}

function splitSentences(normalizedText) {
  return normalizedText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenize(sentence) {
  return sentence
    .replace(/[^\w\s']/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function ngramsWithIndex(tokens, maxLen = 3) {
  const results = [];
  for (let len = maxLen; len >= 1; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      results.push({ phrase: tokens.slice(i, i + len).join(" "), startIndex: i });
    }
  }
  return results;
}

function isNegatedAt(tokens, startIndex) {
  const windowStart = Math.max(0, startIndex - NEGATION_WINDOW);
  const windowTokens = tokens.slice(windowStart, startIndex);
  return windowTokens.some((t) => NEGATION_TERMS.includes(t));
}

function matchEmotions(tokens, emotions, negated) {
  const candidates = ngramsWithIndex(tokens);
  const matchedIndices = new Set();

  for (const { phrase, startIndex } of candidates) {
    if (matchedIndices.has(startIndex)) continue;

    for (const [bucket, triggers] of Object.entries(EMOTION_BUCKETS)) {
      if (triggers.includes(phrase)) {
        matchedIndices.add(startIndex);
        if (isNegatedAt(tokens, startIndex)) {
          negated.add(phrase);
        } else {
          emotions.add(bucket);
        }
        break;
      }
    }
  }
}

function highestIntensityIn(tokens) {
  const candidates = ngramsWithIndex(tokens).map((c) => c.phrase);
  let best = null;

  for (const [level, words] of Object.entries(INTENSITY_MODIFIERS)) {
    if (words.some((w) => candidates.includes(w))) {
      if (!best || INTENSITY_RANK[level] > INTENSITY_RANK[best]) {
        best = level;
      }
    }
  }
  return best;
}

function matchContextTag(normalizedText) {
  for (const [tag, triggers] of Object.entries(CONTEXT_TAGS)) {
    if (triggers.some((word) => normalizedText.includes(word))) {
      return tag;
    }
  }
  return "general_distress";
}
