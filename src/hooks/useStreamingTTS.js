"use client";

/**
 * useStreamingTTS — frontend hook for the Kokoro streaming TTS
 * endpoint at `POST ${baseUrl}/v1/tts/stream`.
 *
 * The endpoint emits a `multipart/mixed` body with one self-contained
 * WAV chunk per Kokoro output chunk, terminated by a closing
 * boundary. This hook:
 *
 *   1. Parses the streaming body incrementally (state machine over
 *      a sliding byte buffer).
 *   2. Decodes each WAV chunk with `decodeAudioData` and pushes the
 *      resulting `AudioBuffer` onto a gapless Web Audio scheduler.
 *   3. Tracks playback head so `wordIndex` can be approximated
 *      from the elapsed audio time, matching the visual UX of the
 *      browser `useSpeechSynthesis` hook.
 *   4. Surfaces typed error codes so the caller can fall back to
 *      the browser hook.
 *
 * Public API mirrors `useSpeechSynthesis` so a caller can swap them
 * transparently. The `backend` value is always `"kokoro-stream"`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_KOKORO_VOICE, KOKORO_VOICES } from "@/lib/kokoroVoices";
import { countWords, tokenizeWithRanges } from "@/lib/ttsTokens";

const BOUNDARY = "--stillpoint-tts-boundary--";
const MIN_RATE = 0.5;
const MAX_RATE = 2.0;

// ---------------- AudioContext singleton ----------------

let _ctx = null;
let _ctxRefCount = 0;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
  } catch (_) {
    return null;
  }
  return _ctx;
}

function acquireCtx() {
  const c = getAudioContext();
  if (c) _ctxRefCount++;
  return c;
}

function releaseCtx() {
  if (!_ctx) return;
  _ctxRefCount = Math.max(0, _ctxRefCount - 1);
  if (_ctxRefCount === 0) {
    try {
      _ctx.close();
    } catch (_) {}
    _ctx = null;
  }
}

// ---------------- Multipart / WAV parser ----------------

/**
 * Minimal streaming multipart/mixed parser tuned to the wire format
 * emitted by `services/kokoro/stream_api.py`.
 *
 * State machine: BOUNDARY -> HEADERS -> BODY -> (back to BOUNDARY)
 *
 * Emits `Part` records as their bodies complete. The `body` slice is
 * owned by the caller — the parser never mutates it.
 */
class MultipartParser {
  constructor() {
    this.state = "BOUNDARY";
    this.buffer = new Uint8Array(0);
  }

  _append(chunk) {
    if (!chunk || chunk.length === 0) return;
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer, 0);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  _consume(n) {
    this.buffer = this.buffer.slice(n);
  }

  _indexOf(pattern) {
    const view = this.buffer;
    const isString = typeof pattern === "string";
    outer: for (let i = 0; i <= view.length - pattern.length; i++) {
      for (let j = 0; j < pattern.length; j++) {
        const p = isString ? pattern.charCodeAt(j) : pattern[j];
        if (view[i + j] !== p) continue outer;
      }
      return i;
    }
    return -1;
  }

  /** Feed bytes. Yields each completed `Part`. */
  *feed(chunk) {
    this._append(chunk);
    while (true) {
      const part = this._step();
      if (!part) return;
      yield part;
    }
  }

  /** Flush any trailing bytes. */
  *end() {
    // Tolerant end: if we're in BODY and the buffer length is at
    // least the recorded Content-Length, emit it.
    if (this.state === "BODY" && this.buffer.length >= this.contentLength) {
      const body = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      yield {
        contentType: this.contentType,
        contentLength: this.contentLength,
        body,
      };
    }
    this.state = "DONE";
  }

  _step() {
    if (this.state === "BOUNDARY") return this._stepBoundary();
    if (this.state === "HEADERS") return this._stepHeaders();
    if (this.state === "BODY") return this._stepBody();
    return null;
  }

  _stepBoundary() {
    const idx = this._indexOf(BOUNDARY);
    if (idx === -1) return null;
    // The bytes before the boundary are not part of any part; drop them.
    this._consume(idx);
    // Now the buffer starts with the boundary literal.
    const afterBoundary = BOUNDARY.length;
    // Check closing boundary: "--" follows.
    const isClosing =
      this.buffer.length >= afterBoundary + 2 &&
      this.buffer[afterBoundary] === 0x2d /* - */ &&
      this.buffer[afterBoundary + 1] === 0x2d;
    if (isClosing) {
      this.state = "DONE";
      this._consume(afterBoundary + 2);
      return null;
    }
    // Expect CRLF after the boundary.
    if (
      this.buffer.length < afterBoundary + 2 ||
      this.buffer[afterBoundary] !== 0x0d /* \r */ ||
      this.buffer[afterBoundary + 1] !== 0x0a /* \n */
    ) {
      // Malformed; bail out by advancing past the boundary so we
      // don't loop forever.
      this._consume(afterBoundary);
      return null;
    }
    this._consume(afterBoundary + 2);
    this.state = "HEADERS";
    return this._stepHeaders();
  }

  _stepHeaders() {
    const sep = this._indexOf("\r\n\r\n");
    if (sep === -1) return null;
    const headerText = new TextDecoder("utf-8").decode(
      this.buffer.slice(0, sep)
    );
    this._consume(sep + 4);

    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      headers[key] = value;
    }
    const contentType = headers["content-type"] || "application/octet-stream";
    const cl = parseInt(headers["content-length"] || "0", 10);
    this.contentType = contentType;
    this.contentLength = Number.isFinite(cl) ? cl : 0;
    this.state = "BODY";
    return this._stepBody();
  }

  _stepBody() {
    if (this.buffer.length < this.contentLength) return null;
    const body = this.buffer.slice(0, this.contentLength);
    let consumed = this.contentLength;
    // Drop the trailing CRLF that delimits the body from the next
    // boundary, if present.
    if (
      this.buffer.length >= consumed + 2 &&
      this.buffer[consumed] === 0x0d &&
      this.buffer[consumed + 1] === 0x0a
    ) {
      consumed += 2;
    }
    this._consume(consumed);
    const part = {
      contentType: this.contentType,
      contentLength: this.contentLength,
      body,
    };
    this.state = "BOUNDARY";
    return part;
  }
}

// ---------------- Hook ----------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function useStreamingTTS({
  baseUrl = "",
  voice: initialVoice = DEFAULT_KOKORO_VOICE,
  lang = "en-US",
  rate: initialRate = 1.05,
  pitch: initialPitch = 1.0,
} = {}) {
  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return false;
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    return true;
  });

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wordIndex, setWordIndex] = useState(-1);
  const [error, setError] = useState(null);
  const [fallbackReason, setFallbackReason] = useState(null);

  const [rate, setRate] = useState(initialRate);
  const [pitch, setPitch] = useState(initialPitch);
  const [voiceURI, setVoiceURI] = useState(initialVoice);

  const audioCtxRef = useRef(null);
  const playbackRef = useRef(null);
  const parserRef = useRef(null);
  const readerRef = useRef(null);
  const abortRef = useRef(null);
  const rafRef = useRef(null);
  // Latest spoken text — kept here so resume() can recompute the
  // highlight tick without re-reading state.
  const textRef = useRef("");
  const tokensRef = useRef([]);

  // Approximate word duration: ~0.42s / rate per word. Cached so the
  // rAF tick is allocation-free.
  const wordDurationRef = useRef(0.42);
  useEffect(() => {
    wordDurationRef.current = 0.42 / Math.max(0.25, rate);
  }, [rate]);

  const teardownPlayback = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pb = playbackRef.current;
    if (pb) {
      if (pb.source) {
        try {
          pb.source.onended = null;
          pb.source.stop();
        } catch (_) {}
        try {
          pb.source.disconnect();
        } catch (_) {}
        pb.source = null;
      }
      pb.queue = [];
      pb.currentBufferIndex = -1;
      pb.startedAt = 0;
      pb.startedAtOffset = 0;
      pb.nextStartTime = 0;
      pb.durationPlayed = 0;
      pb.totalDuration = 0;
      pb.finished = false;
    }
  }, []);

  const abortInFlight = useCallback(() => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (_) {}
      abortRef.current = null;
    }
    if (readerRef.current) {
      try {
        readerRef.current.cancel().catch(() => {});
      } catch (_) {}
      readerRef.current = null;
    }
  }, []);

  const tearDown = useCallback(() => {
    abortInFlight();
    teardownPlayback();
    parserRef.current = null;
  }, [abortInFlight, teardownPlayback]);

  // Acquire the AudioContext lazily on first mount so we don't open
  // it until the user actually wants to listen.
  useEffect(() => {
    if (!supported) return undefined;
    audioCtxRef.current = acquireCtx();
    return () => {
      tearDown();
      releaseCtx();
      audioCtxRef.current = null;
    };
    // tearDown changes only via closure identity; safe to depend once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // ----- wordIndex rAF loop -----
  const startWordTick = useCallback(
    (totalWords) => {
      const tick = () => {
        const pb = playbackRef.current;
        const ctx = audioCtxRef.current;
        const tokens = tokensRef.current || [];
        const textLength = textRef.current?.length || 0;

        if (!pb || !ctx) return;
        if (pb.finished) return;

        const playing =
          pb.source && pb.startedAt > 0 && !pb.pausedRef?.value;
        let played = pb.durationPlayed;
        if (playing) {
          played += ctx.currentTime - pb.startedAt - pb.startedAtOffset;
          if (played < 0) played = 0;
        }

        let estTotalDuration = wordDurationRef.current * totalWords;
        if (pb.parserDone && pb.totalDuration > 0) {
          estTotalDuration = pb.totalDuration;
        }

        if (estTotalDuration > 0 && textLength > 0) {
          const fraction = Math.min(1, played / estTotalDuration);
          const charIdx = Math.floor(fraction * textLength);

          const matchedToken = tokens.find(
            (t) => t.type === "word" && charIdx >= t.startChar && charIdx < t.endChar + 3
          );

          if (matchedToken && matchedToken.wordIndex >= 0) {
            setWordIndex((prev) => Math.max(prev, matchedToken.wordIndex));
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const stopWordTick = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ----- gapless scheduling -----
  const scheduleNext = useCallback(() => {
    const pb = playbackRef.current;
    const ctx = audioCtxRef.current;
    if (!pb || !ctx) return;
    if (pb.pausedRef?.value) return;
    if (pb.source) return; // a source is already running
    const next = pb.currentBufferIndex + 1;
    if (next >= pb.queue.length) return;

    const buf = pb.queue[next];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, pb.nextStartTime);
    src.start(startAt, 0);

    pb.source = src;
    pb.currentBufferIndex = next;
    pb.startedAt = ctx.currentTime;
    pb.startedAtOffset = 0;
    pb.nextStartTime = startAt + buf.duration;
    pb.totalDuration += buf.duration;

    src.onended = () => {
      const stillPb = playbackRef.current;
      if (!stillPb) return;
      if (stillPb.pausedRef?.value) {
        // Pause path tears the source down explicitly.
        return;
      }
      // Only count if this is still the active source.
      if (stillPb.source !== src) return;
      stillPb.durationPlayed += buf.duration;
      stillPb.source = null;

      const lastIdx = stillPb.queue.length - 1;
      if (stillPb.currentBufferIndex >= lastIdx && stillPb.parserDone) {
        stillPb.finished = true;
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        stopWordTick();
        return;
      }
      scheduleNext();
    };
  }, [stopWordTick]);

  const enqueuePart = useCallback(
    async (part) => {
      const ctx = audioCtxRef.current;
      const pb = playbackRef.current;
      if (!ctx || !pb) return;

      if (part.contentType.startsWith("application/json")) {
        const text = new TextDecoder("utf-8").decode(part.body);
        let msg = "unknown";
        try {
          const parsed = JSON.parse(text);
          msg = parsed?.error || msg;
        } catch (_) {
          msg = text || msg;
        }
        throw new Error(`kokoro-stream-error:${msg}`);
      }

      if (!part.contentType.startsWith("audio/")) {
        // Unknown part — skip silently.
        return;
      }

      // decodeAudioData detaches the buffer in Chromium; clone first.
      const ab = part.body.slice().buffer;
      const audioBuffer = await ctx.decodeAudioData(ab);
      pb.queue.push(audioBuffer);
      if (!pb.finished) scheduleNext();
    },
    [scheduleNext]
  );

  const speak = useCallback(
    async (text) => {
      if (!supported) return;
      if (!text) return;

      textRef.current = text;
      tokensRef.current = tokenizeWithRanges(text);

      // Cancel anything in flight.
      tearDown();

      const ctx = audioCtxRef.current;
      if (!ctx) {
        setError("kokoro-no-audio-context");
        setFallbackReason("AudioContext unavailable");
        return;
      }

      // Autoplay policy: must resume after a user gesture.
      try {
        if (ctx.state === "suspended") await ctx.resume();
      } catch (_) {}

      const totalWords = countWords(text);

      playbackRef.current = {
        source: null,
        queue: [],
        currentBufferIndex: -1,
        startedAt: 0,
        startedAtOffset: 0,
        nextStartTime: ctx.currentTime + 0.05,
        durationPlayed: 0,
        totalDuration: 0,
        finished: false,
        parserDone: false,
        pausedRef: { value: false },
      };
      parserRef.current = new MultipartParser();

      setWordIndex(0);
      setError(null);
      setFallbackReason(null);
      setSpeaking(true);
      setPaused(false);

      const controller = new AbortController();
      abortRef.current = controller;

      const url = `${baseUrl.replace(/\/+$/, "")}/v1/tts/stream`;
      const body = JSON.stringify({
        text,
        voice: voiceURI || DEFAULT_KOKORO_VOICE,
        speed: clamp(rate, MIN_RATE, MAX_RATE),
      });

      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "multipart/mixed",
          },
          body,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          setError("kokoro-cancelled");
          setFallbackReason("Cancelled");
        } else {
          setError("kokoro-unreachable");
          setFallbackReason("Service unreachable");
        }
        teardownPlayback();
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        return;
      }

      if (!response.ok) {
        setError(`kokoro-bad-status:${response.status}`);
        setFallbackReason(`HTTP ${response.status}`);
        teardownPlayback();
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        return;
      }

      const ct = response.headers.get("content-type") || "";
      if (!ct.toLowerCase().startsWith("multipart/mixed")) {
        setError("kokoro-bad-content-type");
        setFallbackReason("Bad content type");
        teardownPlayback();
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        return;
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const parser = parserRef.current;

      // Start the highlight tick regardless of when buffers arrive.
      startWordTick(Math.max(1, totalWords));

      const consume = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const part of parser.feed(value)) {
              await enqueuePart(part);
            }
          }
          for (const part of parser.end()) {
            await enqueuePart(part);
          }
          const pb = playbackRef.current;
          if (pb) pb.parserDone = true;
          // If the stream ends without ever enqueueing audio, finish.
          if (playbackRef.current && playbackRef.current.queue.length === 0) {
            playbackRef.current.finished = true;
            setSpeaking(false);
            setPaused(false);
            setWordIndex(-1);
            stopWordTick();
          }
        } catch (err) {
          if (controller.signal.aborted) {
            setError("kokoro-cancelled");
          } else if (
            err &&
            typeof err.message === "string" &&
            err.message.startsWith("kokoro-stream-error:")
          ) {
            setError(err.message);
            setFallbackReason("Stream error");
          } else if (err && err.name === "AbortError") {
            setError("kokoro-cancelled");
          } else {
            setError("kokoro-decode-error");
            setFallbackReason("Decode failed");
          }
          teardownPlayback();
          setSpeaking(false);
          setPaused(false);
          setWordIndex(-1);
          stopWordTick();
        }
      };

      consume();
    },
    [
      supported,
      baseUrl,
      voiceURI,
      rate,
      tearDown,
      teardownPlayback,
      enqueuePart,
      startWordTick,
      stopWordTick,
    ]
  );

  const pause = useCallback(() => {
    const pb = playbackRef.current;
    const ctx = audioCtxRef.current;
    if (!pb || !ctx || pb.finished) return;
    if (!pb.source) return;
    const src = pb.source;
    const buf = src.buffer;
    const elapsed = ctx.currentTime - pb.startedAt - pb.startedAtOffset;
    const offset = clamp(elapsed, 0, buf.duration);
    pb.pausedRef.value = true;
    try {
      src.onended = null;
      src.stop();
    } catch (_) {}
    try {
      src.disconnect();
    } catch (_) {}
    pb.source = null;
    pb.pausedOffset = offset;
    pb.pausedBufferIndex = pb.currentBufferIndex;
    setPaused(true);
    stopWordTick();
  }, [stopWordTick]);

  const resume = useCallback(() => {
    const pb = playbackRef.current;
    const ctx = audioCtxRef.current;
    if (!pb || !ctx || !pb.pausedRef?.value) return;
    const idx = pb.pausedBufferIndex ?? pb.currentBufferIndex;
    const buf = pb.queue[idx];
    if (!buf) return;
    const offset = clamp(pb.pausedOffset || 0, 0, buf.duration);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, pb.nextStartTime);
    src.start(startAt, offset);
    pb.source = src;
    pb.currentBufferIndex = idx;
    pb.startedAt = ctx.currentTime;
    pb.startedAtOffset = -offset; // so currentTime - startedAt - offset = elapsed
    pb.nextStartTime = startAt + (buf.duration - offset);
    pb.pausedRef.value = false;

    src.onended = () => {
      const stillPb = playbackRef.current;
      if (!stillPb) return;
      if (stillPb.pausedRef?.value) return;
      if (stillPb.source !== src) return;
      stillPb.durationPlayed += buf.duration - offset;
      stillPb.source = null;
      const lastIdx = stillPb.queue.length - 1;
      if (stillPb.currentBufferIndex >= lastIdx && stillPb.parserDone) {
        stillPb.finished = true;
        setSpeaking(false);
        setPaused(false);
        setWordIndex(-1);
        stopWordTick();
        return;
      }
      scheduleNext();
    };

    setPaused(false);
    startWordTick(Math.max(1, countWords(textRef.current || "")));
  }, [scheduleNext, startWordTick, stopWordTick]);

  const cancel = useCallback(() => {
    abortInFlight();
    teardownPlayback();
    parserRef.current = null;
    textRef.current = "";
    setSpeaking(false);
    setPaused(false);
    setWordIndex(-1);
    stopWordTick();
  }, [abortInFlight, teardownPlayback, stopWordTick]);

  // Static Kokoro voice set — surfaced for the UI's voice picker.
  const voices = useMemo(() => KOKORO_VOICES, []);

  return {
    supported,
    speaking,
    paused,
    wordIndex,
    voices,
    rate,
    pitch,
    voiceURI,
    backend: "kokoro-stream",
    error,
    fallbackReason,
    setRate,
    setPitch,
    setVoiceURI,
    speak,
    pause,
    resume,
    cancel,
  };
}
