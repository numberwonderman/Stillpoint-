/**
 * lexicon.js — Stillpoint
 *
 * Pure data only. No functions, no execution logic.
 * parser.js is the only file that reads from this module.
 *
 * IMPORTANT: Editing these lists changes what the crisis gate catches
 * and what gets sent (as tags, never raw text) to Gemini. Treat
 * CRISIS_TERMS changes with extra care — err toward over-inclusion.
 */

// ---------------------------------------------------------------------------
// 1. CRISIS_TERMS
// Checked FIRST, before anything else, and NOT subject to negation logic.
// A match here halts parsing immediately and bypasses Gemini entirely.
// Deliberately blunt / non-clever — false positives are safe, false
// negatives are not.
// ---------------------------------------------------------------------------
export const CRISIS_TERMS = [
  "suicide",
  "suicidal",
  "kill myself",
  "killing myself",
  "want to die",
  "wish i was dead",
  "wish i were dead",
  "end it all",
  "end my life",
  "ending my life",
  "not want to be here",
  "don't want to be here",
  "no reason to live",
  "no point in living",
  "better off dead",
  "better off without me",
  "hurt myself",
  "hurting myself",
  "self-harm",
  "self harm",
  "cutting myself",
  "overdose",
  "can't go on",
  "cant go on",
  "want to disappear",
  "tired of living",
  "don't want to wake up",
  "dont want to wake up",
  "don't want to be alive",
  "dont want to be alive",
];

// ---------------------------------------------------------------------------
// 2. EMOTION_BUCKETS
// Trigger word -> broad category. Keep buckets mutually exclusive:
// each trigger word should appear under exactly one bucket. If a word
// could plausibly fit two buckets, pick the more common/general sense
// and leave it out of the other.
// ---------------------------------------------------------------------------
export const EMOTION_BUCKETS = {
  "Sad / Down": [
    "sad", "down", "empty", "hopeless", "miserable", "low", "blue",
  ],
  "Anxious / Worried": [
    "anxious", "worried", "nervous", "on edge", "panicked", "uneasy",
    "overwhelmed", "stressed",
  ],
  "Scared / Afraid": [
    "scared", "afraid", "fearful", "terrified", "frightened", "spooked",
  ],
  "Angry / Frustrated": [
    "angry", "frustrated", "irritated", "furious", "annoyed", "resentful",
  ],
  "Numb / Flat": [
    "numb", "flat", "nothing", "disconnected", "checked out", "blank",
  ],
    "Okay / Good": [
    "okay", "alright", "all right", "fine", "good", "calm", "steady",
    "content", "at ease", "relaxed",
  ],
  "Excited / Happy": [
    "excited", "happy", "great", "glad", "thrilled", "joyful", "hopeful",
    "pumped", "psyched", "stoked", "looking forward",
  ],
};

// ---------------------------------------------------------------------------
// 3. INTENSITY_MODIFIERS
// Word -> intensity level. If multiple modifiers are found in one input,
// parser.js takes the HIGHEST level present (errs toward taking distress
// seriously). Defaults to "moderate" if none are found.
// ---------------------------------------------------------------------------
export const INTENSITY_MODIFIERS = {
  high: ["really", "extremely", "so", "very", "completely", "totally", "overwhelmingly"],
  moderate: ["pretty", "fairly", "somewhat", "kind of", "kinda"],
  low: ["a bit", "a little", "slightly", "mildly", "sort of"],
};

// ---------------------------------------------------------------------------
// 4. NEGATION_TERMS
// Words/phrases that invert an emotion word within a bounded proximity
// window (see parser.js: 3 tokens, does not cross punctuation).
// Does NOT apply to CRISIS_TERMS matching.
// ---------------------------------------------------------------------------
export const NEGATION_TERMS = [
  "not", "no", "never", "don't", "doesn't", "didn't",
  "isn't", "aren't", "wasn't", "weren't", "can't", "won't",
];

// ---------------------------------------------------------------------------
// 5. CONTEXT_TAGS
// Trigger word/phrase -> broad, non-identifying context descriptor.
// These are the ONLY context info sent to Gemini — no raw text, ever.
// Keep tags general on purpose; they should never be specific enough
// to identify a person, place, or exact situation.
// ---------------------------------------------------------------------------
export const CONTEXT_TAGS = {
  work_stress: ["work", "job", "boss", "deadline", "coworker", "meeting", "fired", "shift"],
  academic_stress: ["school", "exam", "class", "professor", "homework", "grades", "studying", "finals"],
  fatigue: ["tired", "exhausted", "can't sleep", "insomnia", "drained", "burnt out", "burned out"],
  relationship: ["partner", "friend", "family", "relationship", "breakup", "argument"],
  isolation: ["lonely", "alone", "isolated", "no one to talk to"],
  health: ["sick", "pain", "doctor", "diagnosis", "illness", "hospital"],
  financial_stress: ["money", "bills", "rent", "debt", "broke", "paycheck"],
  general_distress: [], // fallback tag when no other context matches
};
