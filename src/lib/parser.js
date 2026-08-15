/**
 * parser.js — Stillpoint
 *
 * Turns raw user text into the minimal structured summary sent to
 * gemini.js. Raw text NEVER leaves this module except to be discarded —
 * only the structured output crosses into the network-calling code.
 *
 * Flow (strictly linear, fail-safe):
 *   1. Crisis gate (first, always, ignores negation)
 *   2. Sentence/token split
 *   3. Emotion + negation + intensity + context matching
 *   4. Output assembly
 */

import {
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
 * @returns {{isCrisis: true} | {emotions: string[], intensity: string, negated: string[], contextTag: string, noEmotionsDetected: boolean}}
 */
export function parseInput(rawText) {
  const normalized = normalize(rawText);

  // --- Step 1: Crisis gate — checked first, ignores negation entirely.
  // Over-inclusion is safe here; under-inclusion is not.
  if (containsCrisisTerm(normalized)) {
    return { isCrisis: true };
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
// Helpers
// ---------------------------------------------------------------------------

function normalize(text) {
  return text.toLowerCase().trim();
}

function stripApostrophes(text) {
  return text.replace(/['’]/g, "");
}

function containsCrisisTerm(normalizedText) {
  const stripped = stripApostrophes(normalizedText);
  return CRISIS_TERMS.some((term) => stripped.includes(stripApostrophes(term)));
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
