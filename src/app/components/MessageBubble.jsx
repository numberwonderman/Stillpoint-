"use client";

import { CrisisPanel } from "./ResponseSection";
import SpeechPlayer from "./SpeechPlayer";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useMemo } from "react";


export default function MessageBubble({
  message,
  crisisRegion,
  onChooseCrisisRegion,
}) {
  const { role, text, status, crisis, crisisSeverity, localAIStopped } = message;
  const browserLang = typeof navigator !== "undefined" ? navigator.language : "en-US";

  // Hooks must run unconditionally for every render — keep them above
  // any role-based early returns.
  const {
    supported,
    speaking,
    paused,
    wordIndex,
    voices,
    rate,
    pitch,
    voiceURI,
    setRate,
    setPitch,
    setVoiceURI,
    speak,
    pause,
    resume,
    cancel,
  } = useSpeechSynthesis({ lang: browserLang });

  // Mirror the static text into word/separator tokens for highlighting.
  const displayTokens = useMemo(() => {
    if (!speaking) return null;
    const re = /([A-Za-z0-9'\-]+)|([^A-Za-z0-9'\-]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(text || "")) !== null) {
      out.push({ type: m[1] ? "word" : "sep", text: m[0] });
    }
    return out;
  }, [text, speaking]);

  // Number of "word" tokens that have already been spoken (i.e. tokens
  // before wordIndex in the hook's queue). Used to mark past words.
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

  // Assistant bubble with Crisis Panel
  if (crisis) {
    return (
      <div className="mb-6 flex justify-start w-full min-w-0">
        <div className="w-full max-w-full">
          <CrisisPanel
            severity={crisisSeverity}
            localAIStopped={localAIStopped}
            region={crisisRegion}
            onChooseRegion={onChooseCrisisRegion}
          />
        </div>
      </div>
    );
  }

  // Normal / Streaming Assistant bubble
  const isStreaming = status === "streaming";
  const isEmpty = !text || text.length === 0;

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
              Gemini is writing…
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
              <p className="m-0 whitespace-pre-wrap leading-relaxed text-[0.95rem] sm:text-[1rem] break-words">
                {text}
                {isStreaming && <span aria-hidden="true" className="streaming-caret" />}
              </p>
            )}
            {!isStreaming && (
              <SpeechPlayer
                text={text}
                lang={browserLang}
                supported={supported}
                speaking={speaking}
                paused={paused}
                voices={voices}
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
              />
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
