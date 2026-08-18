"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useSpeechRecognition — thin React wrapper around the Web Speech API.
 *
 * Browser support: Chrome, Edge, Safari (webkitSpeechRecognition). Firefox
 * does not implement it — the hook will simply report `supported: false`
 * so the UI can hide the mic button.
 *
 * Returns:
 *   supported   — boolean — whether the browser exposes the API
 *   listening   — boolean — mic is currently capturing
 *   interim     — string  — words captured so far but not finalized
 *   final       — string  — text from the most recent finalized utterance
 *   error       — string|null — last error message
 *   start() / stop() / toggle()
 */
export function useSpeechRecognition({
  lang = "en-US",
  continuous = true,
  interimResults = true,
  onFinal,
} = {}) {
  const RecognitionRef = useRef(null);
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinal);

  const [supported, setSupported] = useState(() => {
    if (typeof window === "undefined") return true;
    const w = /** @type {any} */ (window);
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [final, setFinal] = useState("");
  const [error, setError] = useState(null);

  // keep latest onFinal without re-creating recognition
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  // one-time init of the SpeechRecognition instance
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = /** @type {any} */ (window);
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition || null;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    RecognitionRef.current = Ctor;
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, []);

  const ensureInstance = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = RecognitionRef.current;
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = continuous;
    r.interimResults = interimResults;

    r.onresult = (event) => {
      let interimBuf = "";
      let finalBuf = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalBuf += res[0].transcript;
        } else {
          interimBuf += res[0].transcript;
        }
      }
      if (finalBuf) {
        setFinal(finalBuf.trim());
        setInterim("");
        try {
          onFinalRef.current?.(finalBuf.trim());
        } catch (_) {}
      } else {
        setInterim(interimBuf);
      }
    };
    r.onerror = (event) => {
      const msg = event?.error || "speech-recognition-error";
      // 'no-speech' is noisy and recoverable; surface others.
      if (msg !== "no-speech") {
        setError(msg);
      }
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = r;
    return r;
  }, [lang, continuous, interimResults]);

  const start = useCallback(() => {
    setError(null);
    const r = ensureInstance();
    if (!r) return;
    try {
      r.start();
      setListening(true);
    } catch (e) {
      // 'InvalidStateError' if already started; ignore.
      setListening(true);
    }
  }, [ensureInstance]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch (_) {}
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  const resetFinal = useCallback(() => setFinal(""), []);

  return {
    supported,
    listening,
    interim,
    final,
    error,
    start,
    stop,
    toggle,
    resetFinal,
  };
}
