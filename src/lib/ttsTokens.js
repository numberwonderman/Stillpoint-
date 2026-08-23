/**
 * Shared tokenizer for TTS highlight indices.
 *
 * Both `useSpeechSynthesis` (browser Web Speech API) and
 * `useStreamingTTS` (Kokoro streaming) compute highlight indices
 * from the same token stream so the UX is identical regardless of
 * the active backend.
 *
 * The regex splits a string into alternating word / non-word runs,
 * matching the previous inline helper that lived inside
 * `useSpeechSynthesis.js`. Keep them in sync.
 */

const TOKEN_RE = /([A-Za-z0-9'\-]+)|([^A-Za-z0-9'\-]+)/g;

/**
 * Tokenize `text` into a list of `{ type, text, startChar, endChar, wordIndex }`
 * records. Words carry an ascending `wordIndex` so callers can map
 * them to a current spoken position; separators carry `-1`.
 *
 * @param {string} text
 * @returns {Array<{type: 'word'|'sep', text: string, startChar: number, endChar: number, wordIndex: number}>}
 */
export function tokenizeWithRanges(text) {
  const tokens = [];
  let wordCount = 0;
  if (!text) return tokens;

  // Reset lastIndex because TOKEN_RE is stateful with /g.
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const isWord = Boolean(m[1]);
    tokens.push({
      type: isWord ? "word" : "sep",
      text: m[0],
      startChar: m.index,
      endChar: m.index + m[0].length,
      wordIndex: isWord ? wordCount : -1,
    });
    if (isWord) wordCount++;
  }
  return tokens;
}

/**
 * Convenience: total number of word tokens in `text`.
 *
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text) return 0;
  let n = 0;
  // Use a fresh regex to avoid mutating TOKEN_RE.lastIndex.
  const re = /[A-Za-z0-9'\-]+/g;
  while (re.exec(text) !== null) n++;
  return n;
}
