"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeechSynthesis({
  lang = "en-US",
  rate: initialRate = 1.15,
  pitch: initialPitch = 1,
  volume: initialVolume = 1,
  voiceURI: initialVoiceURI,
} = {}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wordIndex, setWordIndex] = useState(-1);
  const [wordTokens, setWordTokens] = useState([]); // [{type:'word'|'sep', text}]
  const [voices, setVoices] = useState([]);

  // Mutable voice settings — the UI can change these and the next
  // utterance will use the new values.
  const [rate, setRate] = useState(initialRate);
  const [pitch, setPitch] = useState(initialPitch);
  const [volume, setVolume] = useState(initialVolume);
  const [voiceURI, setVoiceURI] = useState(initialVoiceURI);

  const queueRef = useRef([]); // remaining utterances to speak
  const currentIndexRef = useRef(0);
  const cancelledRef = useRef(false);

  // detect support + populate voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);

    const update = () => setVoices(window.speechSynthesis.getVoices() || []);
    update();
    window.speechSynthesis.onvoiceschanged = update;
    return () => {
      try {
        window.speechSynthesis.onvoiceschanged = null;
      } catch (_) {}
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    };
  }, []);

  const pickVoice = useCallback(() => {
    if (!voices.length) return null;
    if (voiceURI) {
      const exact = voices.find((v) => v.voiceURI === voiceURI);
      if (exact) return exact;
    }
    // prefer a voice matching the requested lang
    const byLang = voices.find((v) => v.lang?.toLowerCase() === lang.toLowerCase());
    if (byLang) return byLang;
    const byLangPrefix = voices.find((v) =>
      v.lang?.toLowerCase().startsWith(lang.toLowerCase().split("-")[0])
    );
    return byLangPrefix || voices[0] || null;
  }, [voices, voiceURI, lang]);

  const tokenize = useCallback((text) => {
    // split into word + separator tokens, preserving order
    // regex: contiguous letters/digits/apostrophes = word; everything else = separator
    const re = /([A-Za-z0-9'\-]+)|([^A-Za-z0-9'\-]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ type: m[1] ? "word" : "sep", text: m[0] });
    }
    return out;
  }, []);

  // Words to feed to the speech engine: same positions as `tokenize`'s
  // word tokens, but with trailing/leading punctuation stripped so the
  // synth doesn't read "comma", "period", etc. The visual highlight in
  // MessageBubble still uses the raw tokens so the on-screen word keeps
  // its original punctuation.

  const speakUtterance = useCallback(
    (text) =>
      new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice();
        if (v) u.voice = v;
        u.lang = v?.lang || lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        try {
          window.speechSynthesis.speak(u);
        } catch (_) {
          resolve();
        }
      }),
    [pickVoice, lang, rate, pitch, volume]
  );

  const drainQueue = useCallback(async () => {
    cancelledRef.current = false;
    while (queueRef.current.length > 0 && !cancelledRef.current) {
      // honor pause: speechSynthesis.pause() suspends the currently
      // playing utterance; we wait for resume() before continuing.
      if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const next = queueRef.current.shift();
      const idx = currentIndexRef.current++;
      setWordIndex(idx);
      await speakUtterance(next);
    }
    if (!cancelledRef.current) {
      setWordIndex(-1);
      setSpeaking(false);
      setPaused(false);
    }
  }, [speakUtterance]);

  const speak = useCallback(
    (text, opts = {}) => {
      if (!supported) return;
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}

      const tokens = tokenize(text);
      const wordPositions = [];
      tokens.forEach((t, i) => {
        if (t.type === "word") wordPositions.push(i);
      });

      const startWordIdx = Math.max(0, opts.fromIndex || 0);
      const sliceStart =
        startWordIdx > 0 && wordPositions[startWordIdx - 1] !== undefined
          ? wordPositions[startWordIdx - 1] + 1
          : 0;
      const slice = tokens.slice(sliceStart);

      // Visual tokens keep their punctuation; the spoken version strips it.
      const spokenSlice = slice.map((t) =>
        t.type === "word"
          ? { ...t, text: t.text.replace(/^[^\w']+|[^\w']+$/g, "") }
          : t
      );

      setWordTokens(slice);
      queueRef.current = spokenSlice.map((t) => t.text).filter((w) => w.length > 0);
      currentIndexRef.current = 0;
      cancelledRef.current = false;
      setSpeaking(true);
      setPaused(false);
      drainQueue();
    },
    [supported, tokenize, drainQueue]
  );

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!speaking || paused) return;
    try {
      window.speechSynthesis.pause();
    } catch (_) {}
    setPaused(true);
  }, [speaking, paused]);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!speaking || !paused) return;
    try {
      window.speechSynthesis.resume();
    } catch (_) {}
    setPaused(false);
    // if the engine finished while paused, restart from the current word
    if (queueRef.current.length === 0) {
      // continue from current word index
      const currentWord = wordIndex >= 0 ? wordIndex : 0;
      const remainingText = wordTokens
        .map((t, i) => (i >= currentWord ? t.text : ""))
        .join("");
      speak(remainingText, { fromIndex: 0 });
    }
  }, [speaking, paused, wordIndex, wordTokens, speak]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
    queueRef.current = [];
    setSpeaking(false);
    setPaused(false);
    setWordIndex(-1);
  }, []);

  return {
    supported,
    speaking,
    paused,
    wordIndex,
    wordTokens,
    voices,
    rate,
    pitch,
    volume,
    voiceURI,
    setRate,
    setPitch,
    setVolume,
    setVoiceURI,
    speak,
    pause,
    resume,
    cancel,
  };
}
