/**
 * lexicon.js — Stillpoint
 *
 * Pure data only. No functions, no execution logic.
 * parser.js is the only file that reads from this module.
 *
 * IMPORTANT: Editing these lists changes what the crisis gate catches
 * and what gets sent (as enum-constrained values, never raw text) to
 * Gemini. Treat CRISIS_TERMS changes with extra care — err toward
 * over-inclusion. The route also uses EMOTION_BUCKETS, INTENSITY_MODIFIERS,
 * and CONTEXT_TAGS to validate the summary it forwards to Gemini.
 */

// ---------------------------------------------------------------------------
// 1. CRISIS_SIGNALS
// Checked FIRST, before anything else, and NOT subject to negation logic.
// A match here halts parsing immediately and bypasses Gemini entirely.
//
// Each entry has:
//   - phrases: list of normalized substrings to scan for (all matched
//     against the lowercase, apostrophe-stripped text via word-boundary
//     matching where possible — see parser.js containsCrisisTerm).
//   - weight: severity contribution. The detector sums weights across
//     matched categories and maps the total to a severity tier
//     (elevated | high | imminent). UI uses the tier to adapt its tone
//     and which resources it foregrounds.
//   - category: human-readable label (ideation | intent | plan | means
//     | timeframe | hopelessness | self_harm | goodbye). Useful for
//     logging/debugging and for surfacing a tailored headline.
//
// Deliberately blunt — false positives are safe, false negatives are not.
// We over-include on purpose. The detector also does fuzzy / pattern-based
// matching beyond this list (see parser.js crisisPatterns) so a phrase
// like "I'm gonna jump off a bridge" still trips the gate even if the
// exact words aren't enumerated below.
// ---------------------------------------------------------------------------
export const CRISIS_SIGNALS = {
  // Direct statements of suicidal thinking. Highest-confidence matches.
  ideation: {
    category: "ideation",
    weight: 3,
    phrases: [
      "suicide",
      "suicidal",
      "kill myself",
      "killing myself",
      "take my own life",
      "taking my own life",
      "want to die",
      "wanna die",
      "rather be dead",
      "wish i was dead",
      "wish i were dead",
      "want to be dead",
      "dont want to live",
      "don't want to live",
      "don't want to be alive",
      "dont want to be alive",
      "not want to be alive",
      "no will to live",
      "no reason to live",
      "no point in living",
      "no point to live",
      "rather die",
      "better off dead",
      "better off without me",
      "tired of living",
      "tired of being alive",
      "want to disappear",
      "wanna disappear",
      "end it all",
      "end my life",
      "ending my life",
      "end it tonight",
      "end it tomorrow",
      "end everything",
      "not want to be here",
      "don't want to be here",
      "dont want to be here",
      "dont want to wake up",
      "don't want to wake up",
      "never want to wake up",
    ],
  },

  // Statements of intent — not just thinking, but planning or intending.
  intent: {
    category: "intent",
    weight: 5,
    phrases: [
      "gonna kill myself",
      "going to kill myself",
      "going to end it",
      "gonna end it",
      "gonna do it",
      "going to do it",
      "plan to kill",
      "planning to kill",
      "plan to end",
      "planning to end",
      "ready to die",
      "ready to end it",
      "decided to die",
      "decided to end it",
      "going to hurt myself",
      "gonna hurt myself",
      "about to kill",
      "about to end",
    ],
  },

  // Specific plans — having a method, place, or arrangement. Highest weight.
  plan: {
    category: "plan",
    weight: 7,
    phrases: [
      "have a plan to",
      "made a plan to",
      "picked a date",
      "set a date",
      "wrote a note",
      "wrote a letter",
      "said goodbye",
      "giving away my",
      "giving my things away",
    ],
  },

  // Means — references to a specific method. Often a sharp signal.
  means: {
    category: "means",
    weight: 4,
    phrases: [
      "jump off",
      "jumping off",
      "jumped off",
      "hang myself",
      "hanging myself",
      "overdose",
      "overdosed",
      "overdosing",
      "swallow pills",
      "took all my pills",
      "took all the pills",
      "walk into traffic",
      "step in front of",
      "slit my wrists",
      "cut my wrists",
      "carbon monoxide",
      "gun to my head",
      "shoot myself",
    ],
  },

  // Timeframe — a "when" dramatically raises the urgency.
  timeframe: {
    category: "timeframe",
    weight: 4,
    phrases: [
      "tonight",
      "before dawn",
      "when they fall asleep",
      "when everyone is asleep",
      "tomorrow morning",
      "this weekend",
      "after the kids",
      "after work",
      "after the party",
      "one last time",
      "last night alive",
      "final day",
    ],
  },

  // Hopelessness / giving up — often a precursor. Lower individual weight
    // but commonly co-occurs with ideation, so the sum usually tips the scale.
  hopelessness: {
    category: "hopelessness",
    weight: 2,
    phrases: [
      "no way out",
      "no point anymore",
      "no hope",
      "hopeless",
      "nothing to live for",
      "nothing matters anymore",
      "can't go on",
      "cant go on",
      "can't do this anymore",
      "cant do this anymore",
      "can't take it anymore",
      "cant take it anymore",
      "done trying",
      "give up on life",
      "giving up on life",
      "falling apart",
    ],
  },

  // Self-harm — ACTIVE behavior. Present-tense or recent-tense, with or
  // without suicidal intent. Always triages to crisis panel because
  // harm-reduction resources matter. Soft / hypothetical framings live
  // in self_harm_soft and are scored by the parser's soft-group rule.
  //
  // The bare abstract noun "self-harm" / "self harm" is intentionally
  // NOT listed here — on its own it doesn't indicate active behavior
  // ("I've been wanting to self-harm" is hedging, not action). The
  // active self_harm_active regex in CRISIS_PATTERNS still catches
  // present-tense framings like "i'm cutting myself right now".
  self_harm_active: {
    category: "self_harm_active",
    weight: 3,
    phrases: [
      "cutting myself",
      "cut myself",
      "cuts on my arm",
      "cut on my arm",
      "burning myself",
      "burned myself",
      "hitting myself",
      "hit myself",
      "pulled out my hair",
      "pulling out my hair",
      "picking at my skin",
      "starving myself",
      "not eating on purpose",
    ],
  },

  // Self-harm — SOFT / HYPOTHETICAL. Phrasings like "I feel like hurting
  // myself" or "I've been wanting to self-harm" or "the idea of hurting
  // myself". On its own this does NOT trip the gate (see parser.js
  // soft-group scoring rule). It only contributes weight when another
  // non-soft crisis category has already fired.
  self_harm_soft: {
    category: "self_harm_soft",
    weight: 1,
    phrases: [
      "hurt myself",
      "hurting myself",
      "self-harm",
      "self harm",
    ],
  },

  // Goodbye-style language — written or spoken goodbyes that hint at finality.
  goodbye: {
    category: "goodbye",
    weight: 3,
    phrases: [
      "i'm sorry for everything",
      "im sorry for everything",
      "forgive me",
      "i love you all",
      "i love you guys",
      "tell them i love them",
      "tell her i love her",
      "tell him i love him",
      "please remember me",
      "this is my last",
      "last message",
      "final message",
      "won't be here tomorrow",
      "wont be here tomorrow",
      "won't be around much longer",
      "wont be around much longer",
    ],
  },
};

// Pattern-based crisis signals. Each pattern is a RegExp run over the
// normalized, apostrophe-stripped text. Useful for things the phrase
// list can't catch — e.g. "I'm going to [verb] myself", "I've got the
// [pills/rope/gun] ready", or a single high-risk word in context.
// Each pattern carries the same `weight` and `category` shape as
// CRISIS_SIGNALS entries so the scorer can fold them in uniformly.
export const CRISIS_PATTERNS = [
  // "i'm going to [verb] myself" / "i'm gonna [verb] myself"
  {
    category: "intent",
    weight: 5,
    pattern: /\b(?:i'?m|i am|im)\s+(?:going to|gonna|about to|planning to|going ta)\s+(?:\w+\s+){0,3}myself\b/,
  },
  // "[pronoun] should just [verb] [themselves] off" / similar reflexive
  {
    category: "ideation",
    weight: 3,
    pattern: /\b(?:i|we|he|she|they)\s+(?:should|ought to|need to|have to|gotta)\s+(?:\w+\s+){0,2}(?:myself|ourselves|himself|herself|themselves)\b/,
  },
  // "no one would [miss / care / notice] [if] i [was/were] gone"
  {
    category: "hopelessness",
    weight: 3,
    pattern: /\bno\s+one\s+would\s+(?:miss|care|notice|remember)\s+(?:(?:\w+\s+){0,3})?(?:i|i'd|i'd be|i would be|i would)\s+(?:was|were|am|disappeared|died|gone|dead|not here)\b/,
  },
  // "i'd be better off dead" / "i'd be better off without myself"
  {
    category: "hopelessness",
    weight: 3,
    pattern: /\bi(?:'d| would)\s+be\s+(?:better off|just as well off|happier)\s+(?:dead|gone|not here|out of the way|without me)\b/,
  },
  // "everyone would be [better] off without me"
  {
    category: "hopelessness",
    weight: 3,
    pattern: /\b(?:every(one|body)|the world|my family|they)\s+would\s+be\s+(?:better|happier|safer)\s+(?:off\s+)?without\s+me\b/,
  },
  // "i [have/had/got] the [pills/rope/gun/knife]"
  {
    category: "means",
    weight: 5,
    pattern: /\bi\s+(?:have|had|got|own|found|bought)\s+(?:the|a|some|my)\s+(?:\w+\s+){0,2}(?:pills|rope|gun|knife|blade|gunshot|carbon monoxide)\b/,
  },
  // single-word high-risk tokens in context (only when "i" is in the sentence)
  {
    category: "ideation",
    weight: 4,
    pattern: /\bi\s+(?:just\s+)?(?:wanna|want to|wanted to|wish i could)\s+die\b/,
  },
  // "end my [life/story]" / "end it" / "end everything" — but only when
  // the object is a crisis-relevant noun. "end this meeting" must not
  // match, so the right-hand side is enumerated, not open-ended.
  {
    category: "ideation",
    weight: 3,
    pattern: /\bend\s+(?:my\s+(?:life|story)|it(?:\s+all)?|everything|things|this\s+(?:life|pain|suffering))\b/,
  },
  // "[pronoun] should [just] end it" — common soft phrasing
  {
    category: "ideation",
    weight: 3,
    pattern: /\b(?:i|we)\s+(?:should|ought to|need to|have to|gotta|might|might as well|may as well)\s+(?:just\s+)?(?:end it|kill myself|die|disappear)\b/,
  },

  // ---------------------------------------------------------------------
  // Active self-harm patterns (defense in depth on top of self_harm_active
  // phrases). Catches present-tense framings like "i'm cutting myself
  // right now" or "i just burned myself".
  // ---------------------------------------------------------------------
  {
    category: "self_harm_active",
    weight: 3,
    pattern: /\b(?:i|im|i am|i'?m)\s+(?:just|right\s+now|rn)?\s*(?:cutting|hitting|burning|pulling\s+out\s+my\s+hair|starving|starved|hurting\s+on\s+purpose)\s+myself\b/,
  },

  // ---------------------------------------------------------------------
  // Hedging demotions — match the soft self-harm surface in a hedging
  // frame. They do NOT add weight; they DEMOTE the self_harm_soft
  // contribution (see parser.js soft-group rule).
  //
  // Covers "i feel like / want to / been wanting / sometimes think about
  // / thoughts of / fantasized about" + the self-harm action verb.
  // ---------------------------------------------------------------------
  {
    category: "self_harm_hedge",
    weight: 0,
    demotes: ["self_harm_soft"],
    pattern: /\b(?:i|im|i'?m|i\s+am)\s+(?:(?:sometimes|often|always|just)\s+)?(?:feel\s+like|wanted\s+to|wanna|want\s+to|wanted|been\s+wanting|have\s+wanted|am\s+wanting|think\s+about|thought\s+about|thinking\s+about|thoughts\s+of|fantasiz\w+\s+about|dreamed?\s+about|consider\w+)\s+(?:hurting|hurt|cutting|hitting|burning|killing|self[-\s]?harm)\b/,
  },
  // "the idea of hurting myself" / "the thought of cutting myself"
  {
    category: "self_harm_hedge",
    weight: 0,
    demotes: ["self_harm_soft"],
    pattern: /\b(?:the\s+(?:idea|thought)\s+of)\s+(?:hurting|hurt|cutting|hitting|burning|killing|self[-\s]?harm)\b/,
  },
  // "i'm not actually going to do it / not really going to hurt myself" —
  // explicit non-action framing.
  {
    category: "self_harm_hedge",
    weight: 0,
    demotes: ["self_harm_soft"],
    pattern: /\b(?:i|im|i'?m)\s+(?:am\s+)?not\s+(?:actually\s+|really\s+|gonna\s+|going\s+to\s+)?(?:do\s+(?:it|anything)|hurt\s+myself|kill\s+myself|self[-\s]?harm)/,
  },
];

// Back-compat alias. Older code paths (and tests) that import CRISIS_TERMS
// still work — they get the flat phrase list built from CRISIS_SIGNALS.
export const CRISIS_TERMS = Object.values(CRISIS_SIGNALS).flatMap((g) => g.phrases);

// Severity tier thresholds — total weight from all matched signals:
//   elevated (>= 2)  : crisis resources shown, tone warm and gentle
//   high     (>= 5)  : crisis resources + more direct framing
//   imminent (>= 9)  : resources + "right now" framing + 911 surfaced
// Any single match in `intent` or `plan` (weight >= 5) automatically
// escalates to at least "high". The thresholds are intentionally low —
// the cost of over-escalation is a slightly stronger panel; the cost of
// under-escalation is someone not getting help.
export const CRISIS_SEVERITY_THRESHOLDS = {
  elevated: 2,
  high: 5,
  imminent: 9,
};

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
