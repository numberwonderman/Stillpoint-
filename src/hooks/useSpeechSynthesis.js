"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tokenizeWithRanges as tokenizeText } from "@/lib/ttsTokens";

export function useSpeechSynthesis({
  lang = "en-US",
  rate: initialRate = 1.05,
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

  const activeUtteranceRef = useRef(null);
  const fullTextRef = useRef("");
  const fallbackTimerRef = useRef(null);

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
      if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
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

  const clearTimers = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const speak = useCallback(
    (text) => {
      if (!supported || !text) return;

      clearTimers();
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}

      fullTextRef.current = text;
      const tokensWithRanges = tokenizeText(text);
      setWordTokens(tokensWithRanges);

      const wordTokensList = tokensWithRanges.filter((t) => t.type === "word");
      if (wordTokensList.length === 0) return;

      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang || lang;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;

      let lastMatchedIndex = 0;
      setWordIndex(0);

      // Real-time boundary event listener
      u.onboundary = (event) => {
        if (typeof event.charIndex === "number") {
          const charIdx = event.charIndex;
          // Find token matching charIdx
          const matchedToken = tokensWithRanges.find(
            (t) => t.type === "word" && charIdx >= t.startChar && charIdx < t.endChar + 3
          );
          if (matchedToken && matchedToken.wordIndex >= 0) {
            lastMatchedIndex = matchedToken.wordIndex;
            setWordIndex(matchedToken.wordIndex);
          }
        }
      };

      u.onend = () => {
        clearTimers();
        setWordIndex(-1);
        setSpeaking(false);
        setPaused(false);
        activeUtteranceRef.current = null;
      };

      u.onerror = () => {
        clearTimers();
        setWordIndex(-1);
        setSpeaking(false);
        setPaused(false);
        activeUtteranceRef.current = null;
      };

      activeUtteranceRef.current = u;
      setSpeaking(true);
      setPaused(false);

      try {
        window.speechSynthesis.speak(u);
      } catch (_) {
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        return;
      }

      // Fallback timer: if browser speech synth onboundary isn't supported for selected voice,
      // progress highlight smoothly based on text length & speech rate.
      const totalWords = wordTokensList.length;
      const startTime = Date.now();
      // Estimated total speech duration in ms based on character count and speed rate
      const totalChars = text.length;
      const estDurationMs = Math.max(800, (totalChars / 14) * (1000 / rate));

      fallbackTimerRef.current = setInterval(() => {
        if (window.speechSynthesis.paused) return;
        const elapsed = Date.now() - startTime;
        const fraction = Math.min(1, elapsed / estDurationMs);
        const estWordIdx = Math.floor(fraction * totalWords);

        // Advance wordIndex smoothly if boundary events haven't caught up
        if (estWordIdx > lastMatchedIndex && estWordIdx < totalWords) {
          lastMatchedIndex = estWordIdx;
          setWordIndex(estWordIdx);
        }
      }, 100);
    },
    [supported, lang, rate, pitch, volume, pickVoice, tokenizeText, clearTimers]
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
  }, [speaking, paused]);

  const cancel = useCallback(() => {
    clearTimers();
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
    activeUtteranceRef.current = null;
    setSpeaking(false);
    setPaused(false);
    setWordIndex(-1);
  }, [clearTimers]);

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

