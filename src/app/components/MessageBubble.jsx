"use client";

import { CrisisPanel } from "./ResponseSection";
import SpeechPlayer from "./SpeechPlayer";
import ResourceCard from "./ResourceCard";
import Markdown from "./Markdown";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useStreamingTTS } from "@/hooks/useStreamingTTS";
import { KOKORO_VOICES } from "@/lib/kokoroVoices";
import { tokenizeWithRanges as tokenizeText } from "@/lib/ttsTokens";
import { useEffect, useMemo, useRef } from "react";

export default function MessageBubble({
  message,
  crisisRegion,
  onChooseCrisisRegion,
  onAcknowledgeCrisis,
}) {
  const { role, text, status, crisis, crisisSeverity, localAIStopped, resources, acknowledgedAt } = message;
  const browserLang = typeof navigator !== "undefined" ? navigator.language : "en-US";

  // Hooks must run unconditionally for every render — keep them above
  // any role-based early returns.
  const speech = useSpeechSynthesis({ lang: browserLang });
  const streaming = useStreamingTTS({
    baseUrl: process.env.NEXT_PUBLIC_KOKORO_URL || "",
    voice: "af_heart",
    lang: browserLang,
  });

  // Active backend — prefer Kokoro streaming when the service URL is
  // configured and the AudioContext is available.
  const useStreaming = !!streaming.supported;
  const activeBackend = useStreaming ? "kokoro-stream" : "browser";

  const {
    supported,
    speaking,
    paused,
    wordIndex,
    rate,
    pitch,
    voiceURI,
    setRate,
    setPitch,
    setVoiceURI,
    speak: speakBrowser,
    pause: pauseBrowser,
    resume: resumeBrowser,
    cancel: cancelBrowser,
  } = speech;

  const speak = useStreaming ? streaming.speak : speakBrowser;
  const pause = useStreaming ? streaming.pause : pauseBrowser;
  const resume = useStreaming ? streaming.resume : resumeBrowser;
  const cancel = useStreaming ? streaming.cancel : cancelBrowser;
  const activeVoices = useStreaming ? KOKORO_VOICES : speech.voices;

  // Auto-fallback: if the streaming backend reports a new error for
  // this message, hand off to the browser hook once. The badge flips
  // on the next Listen click (because `streaming.error` stays set
  // until `streaming.cancel()` resets it; we explicitly clear it
  // here so the next attempt can try Kokoro again).
  const lastAutoFallbackTextRef = useRef("");
  useEffect(() => {
    if (!useStreaming) return;
    if (!streaming.error) return;
    if (!text) return;
    if (lastAutoFallbackTextRef.current === text) return;
    lastAutoFallbackTextRef.current = text;
    // Hand the text to the browser hook and stop the streaming one.
    try {
      streaming.cancel();
    } catch (_) {}
    try {
      speakBrowser(text);
    } catch (_) {}
  }, [streaming.error, text, useStreaming, streaming, speakBrowser]);

  // Mirror the static text into word/separator tokens for highlighting.
  const displayTokens = useMemo(() => {
    if (!speaking) return null;
    return tokenizeText(text || "").map(({ type, text: tok }) => ({
      type: type === "word" ? "word" : "sep",
      text: tok,
    }));
  }, [text, speaking]);

  // Number of "word" tokens that have already been spoken.
  const spokenWordCount = useMemo(() => {
    if (!speaking || wordIndex < 0) return 0;
    return wordIndex + 1;
  }, [speaking, wordIndex]);

  // System status message
  if (role === "system") {
    return (
      <div className="my-3 flex justify-center text-xs font-medium text-text-muted">
        <span className="rounded-full bg-surface-raised/50 px-3 py-1 border border-border/20 max-w-full truncate">
          {text}
        </span>
      </div>
    );
  }

  // User bubble
  if (role === "user") {
    return (
      <div className="mb-4 flex justify-end w-full">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-[18px] rounded-tr-[4px] bg-[var(--color-user-bubble,#192a28)] border border-accent/15 px-4.5 py-3 text-text shadow-xs break-words overflow-hidden">
          <p className="m-0 whitespace-pre-wrap leading-relaxed text-[0.95rem] sm:text-[1rem] break-words">
            {text}
          </p>
        </div>
      </div>
    );
  }

  // Assistant bubble with Crisis Panel (full crisis state)
  if (crisis) {
    return (
      <div className="mb-6 flex justify-start w-full min-w-0">
        <div className="w-full max-w-full">
          <CrisisPanel
            severity={crisisSeverity}
            localAIStopped={localAIStopped}
            region={crisisRegion}
            onChooseRegion={onChooseCrisisRegion}
            onAcknowledge={onAcknowledgeCrisis}
            resources={resources}
          />
        </div>
      </div>
    );
  }

  // Acknowledged crisis panel — the user clicked "I'm safe — continue".
  // Render a small, quiet transitional note in place of the now-empty
  // assistant bubble, so the user has visible confirmation that the
  // dismissal registered and the conversation is continuing.
  if (role === "assistant" && acknowledgedAt) {
    return (
      <div className="mb-3 flex justify-start w-full">
        <div className="rounded-full border border-border/40 bg-surface/50 px-3 py-1.5 text-[0.8125rem] text-text-muted">
          ✓ Crisis panel dismissed — continuing the conversation.
        </div>
      </div>
    );
  }

  // Normal / Streaming Assistant bubble
  const isStreaming = status === "streaming";
  const isEmpty = !text || text.length === 0;
  const hasResources = Array.isArray(resources) && resources.length > 0;

  return (
    <div className="mb-4 flex justify-start w-full animate-bubble-appear">
      <div
        className={`max-w-[90%] sm:max-w-[85%] rounded-[18px] rounded-tl-[4px] bg-surface border px-5 py-4 text-text shadow-xs break-words transition-all duration-300 ${
          isStreaming
            ? "streaming-bubble border-accent/40"
            : "border-border/20"
        }`}
      >
        {isStreaming && isEmpty ? (
          <div className="flex items-center gap-3 py-1 text-text-muted">
            <div className="flex gap-1.5 items-center">
              <span className="thinking-dot h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "0ms" }} />
              <span className="thinking-dot h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "200ms" }} />
              <span className="thinking-dot h-2 w-2 rounded-full bg-accent" style={{ animationDelay: "400ms" }} />
            </div>
            <span className="text-xs font-medium tracking-wide opacity-85 animate-pulse">
              Stillpoint is thinking…
            </span>
          </div>
        ) : (
          <>
            {speaking && displayTokens ? (
              <HighlightedText
                tokens={displayTokens}
                spokenWordCount={spokenWordCount}
                trailingCaret={false}
              />
            ) : (
              <div className="md-wrapper text-[0.95rem] sm:text-[1rem]">
                <Markdown streaming={isStreaming}>{text}</Markdown>
              </div>
            )}

            {!isStreaming && (
              <SpeechPlayer
                text={text}
                lang={browserLang}
                supported={supported}
                speaking={speaking}
                paused={paused}
                voices={activeVoices}
                rate={rate}
                pitch={pitch}
                voiceURI={voiceURI}
                onChangeRate={setRate}
                onChangePitch={setPitch}
                onChangeVoice={setVoiceURI}
                speak={speak}
                pause={pause}
                resume={resume}
                cancel={cancel}
                backend={activeBackend}
              />
            )}

            {/* Resource cards — shown after response is done */}
            {hasResources && !isStreaming && (
              <div className="mt-5 pt-4 border-t border-border/30 space-y-2.5 animate-resources-appear">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border/40" />
                  <span className="text-[0.75rem] font-bold uppercase tracking-[0.15em] text-text-muted/60 shrink-0">
                    Support resources
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="flex flex-col gap-2.5">
                  {resources.map((res, i) => (
                    <ResourceCard key={i} resource={res} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * HighlightedText — render `tokens` with the first N "word" tokens dimmed,
 * the (N+1)th word accented, and the rest muted. Used during TTS playback.
 */
function HighlightedText({ tokens, spokenWordCount, trailingCaret = false }) {
  let wordsSeen = 0;
  return (
    <p className="m-0 whitespace-pre-wrap leading-relaxed text-[0.95rem] sm:text-[1rem] break-words">
      {tokens.map((t, i) => {
        if (t.type !== "word") {
          return <span key={i}>{t.text}</span>;
        }
        const isActive = wordsSeen === spokenWordCount - 1;
        const isPast = wordsSeen < spokenWordCount - 1;
        wordsSeen++;
        return (
          <span
            key={i}
            className={`rounded-[3px] px-[1px] transition-colors duration-150 ${
              isActive
                ? "bg-accent/30 text-text"
                : isPast
                  ? "text-text-muted/70"
                  : "text-text-muted/85"
            }`}
          >
            {t.text}
          </span>
        );
      })}
      {trailingCaret && <span aria-hidden="true" className="streaming-caret" />}
    </p>
  );
}
