"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MODEL_CATALOG } from "@/lib/localai";

/**
 * Composer — anchored input box at the bottom of the chat container.
 * Auto-growing textarea, mic-driven speech-to-text input, send button,
 * key shortcuts, disabled state handling.
 *
 * Mic UX:
 *  - toggle the mic button to start / stop dictation
 *  - interim words stream into the textarea as the user speaks
 *  - when an utterance is finalized, the transcript is appended (with a
 *    trailing space) into the textarea at the cursor
 *  - mic-disabled states are surfaced so users know why it isn't working
 */
export default function Composer({
  onSubmit,
  onStopGeneration,
  disabled = false,
  isGenerating = false,
  isDownloading = false,
  localAIEnabled,
  selectedTier,
  downloadState,
  readyModelKey,
  onOpenModelModal,
  onEnableLocalAI,
  onDisableLocalAI,
  onSelectTier,
  onStartDownload,
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Speech-to-text
  const {
    supported: sttSupported,
    listening,
    interim,
    final,
    error: sttError,
    toggle: toggleMic,
    resetFinal,
  } = useSpeechRecognition({
    lang: typeof navigator !== "undefined" ? (navigator.language || "en-US") : "en-US",
    continuous: true,
    interimResults: true,
    onFinal: (t) => {
      // append finalized text into the textarea at the caret
      setText((prev) => {
        const sep = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
        return prev + sep + t;
      });
    },
  });

  // Live-update textarea with interim transcript while speaking.
  // We render the interim value through a separate overlay so the user's
  // committed text isn't disturbed if they edit while speaking.
  // For simplicity here, we mirror interim into a ref and reflect it via
  // a styled ghost layer behind the textarea.
  const [showMicHint, setShowMicHint] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const pickerRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    function handleOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowModelPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showModelPicker]);

  // Auto-resize textarea based on content height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text, interim]);

  // Briefly surface a hint the first time the user enables the mic
  useEffect(() => {
    if (listening) {
      setShowMicHint(true);
      const t = setTimeout(() => setShowMicHint(false), 2500);
      return () => clearTimeout(t);
    }
  }, [listening]);

  // clear stale final on unmount
  useEffect(() => () => resetFinal(), [resetFinal]);

  const isSendDisabled = !text.trim() || disabled || isGenerating || isDownloading;

  function handleSend(e) {
    if (e) e.preventDefault();
    if (isSendDisabled) return;
    onSubmit(text);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSendDisabled) {
        handleSend();
      }
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSendDisabled) {
        handleSend();
      }
    }
  }

  return (
    <div className="sticky bottom-0 shrink-0 bg-bg/95 p-3 sm:p-4 backdrop-blur-md w-full max-w-full z-10 border-t border-border/20">
      <div className="mx-auto max-w-3xl w-full">
        <form
          onSubmit={handleSend}
          className="relative flex flex-col rounded-[16px] border border-border/60 bg-surface shadow-lg focus-within:border-accent/60 transition-colors w-full max-w-full"
        >
          {/* Textarea + live interim overlay */}
          <div className="relative w-full max-w-full">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={
                isGenerating
                  ? "Type your next message while Stillpoint responds…"
                  : listening
                    ? "Listening — speak now…"
                    : "Type how you're feeling…"
              }
              aria-label="Describe how you're feeling"
              className="relative z-10 w-full max-w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[0.95rem] text-text placeholder:text-text-muted/50 focus:outline-none disabled:opacity-50 break-words caret-accent"
              style={{ minHeight: "44px" }}
            />
            {/* Interim ghost text — shows words being captured but not
                yet finalized, in a muted accent color. Sits behind the
                real textarea via z-index so it never blocks input. */}
            {listening && interim && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 px-4 pt-3.5 pb-2 text-[0.95rem] whitespace-pre-wrap break-words text-text-muted/60"
              >
                <span className="invisible">{text}</span>
                <span className="text-accent/80">{interim}</span>
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-accent align-middle" />
              </div>
            )}
          </div>

          {/* Listening pulse bar */}
          {listening && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 px-4 pt-1 text-[0.72rem] font-medium text-accent"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span>
                {showMicHint
                  ? "Speak naturally — your words will appear here"
                  : interim
                    ? "Capturing…"
                    : "Listening…"}
              </span>
            </div>
          )}

          {/* STT error toast */}
          {sttError && !listening && (
            <div className="px-4 pt-1 text-[0.72rem] font-medium text-crisis">
              Mic error: {sttError}
            </div>
          )}

          <div className="flex items-center justify-between px-3.5 pb-3 pt-1 border-t border-border/20">
            {/* Model picker trigger */}
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                id="model-picker-trigger"
                onClick={() => setShowModelPicker((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-surface-raised/60 px-2.5 py-1 text-xs font-semibold text-text-muted hover:text-accent hover:border-accent/40 transition-all"
              >
                <span>{localAIEnabled ? "💻" : "☁️"}</span>
                <span className="max-w-[90px] truncate">
                  {localAIEnabled
                    ? (MODEL_CATALOG[selectedTier]?.label ?? selectedTier ?? "Local")
                    : "Cloud"}
                </span>
                {/* Chevron up/down */}
                <svg
                  width="10" height="10" viewBox="0 0 10 10" fill="none"
                  className={`transition-transform duration-200 ${showModelPicker ? "rotate-180" : ""}`}
                >
                  <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Upward-opening picker panel */}
              {showModelPicker && (
                <div
                  role="listbox"
                  aria-label="Select AI model"
                  className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border/50 bg-surface shadow-2xl z-30 overflow-hidden animate-modal-pop"
                >
                  {/* Cloud option */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={!localAIEnabled}
                    onClick={() => { onDisableLocalAI?.(); setShowModelPicker(false); }}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                      !localAIEnabled
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:bg-surface-raised hover:text-text"
                    }`}
                  >
                    <span className="text-base">☁️</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">Cloud (Gemini)</div>
                      <div className="text-[0.67rem] opacity-70">Fast · Requires internet</div>
                    </div>
                    {!localAIEnabled && <span className="text-[0.65rem] font-bold text-accent">✓ Active</span>}
                  </button>

                  <div className="mx-3 border-t border-border/30 my-1" />
                  <div className="px-3.5 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-text-muted/60">On-Device Models</div>

                  {/* Local model tiers */}
                  {Object.entries(MODEL_CATALOG).map(([key, meta]) => {
                    const isActive = localAIEnabled && selectedTier === key;
                    const isDownloaded = readyModelKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          onEnableLocalAI?.();
                          onSelectTier?.(key);
                          if (!isDownloaded && onStartDownload) {
                            onStartDownload(key);
                          }
                          setShowModelPicker(false);
                        }}
                        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                          isActive
                            ? "bg-accent/10 text-accent"
                            : "text-text-muted hover:bg-surface-raised hover:text-text"
                        }`}
                      >
                        <span className="text-base">💻</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{meta.label}</span>
                            <span className="text-[0.62rem] opacity-60">{meta.params} · {meta.approxSizeLabel}</span>
                          </div>
                          <div className="text-[0.67rem] opacity-60 truncate">{meta.blurb}</div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {isActive && <span className="text-[0.65rem] font-bold text-accent">✓ Active</span>}
                          {isDownloaded && !isActive && <span className="text-[0.65rem] text-accent/70">✓ Cached</span>}
                          {!isDownloaded && <span className="text-[0.62rem] opacity-40">Not downloaded</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isGenerating && text.trim() ? (
                <span className="hidden sm:inline text-xs text-accent font-medium animate-pulse">
                  Waiting for response…
                </span>
              ) : (
                <span className="hidden sm:inline text-xs text-text-muted/60">Press Enter ↵</span>
              )}

              {/* Mic button — always rendered so user sees mic option even before clicking input area */}
              <button
                type="button"
                onClick={() => {
                  if (sttSupported) {
                    toggleMic();
                  } else if (typeof window !== "undefined") {
                    alert("Speech-to-text is not supported in this browser. Please use Chrome, Edge, or Safari.");
                  }
                }}
                aria-label={listening ? "Stop dictation" : "Start voice dictation"}
                title={
                  !sttSupported
                    ? "Speech-to-text not supported in this browser"
                    : listening
                      ? "Stop dictation"
                      : "Voice dictation (speech-to-text)"
                }
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border transition-all ${
                  listening
                    ? "bg-crisis/15 border-crisis/40 text-crisis animate-pulse shadow-sm"
                    : "bg-surface-raised/80 border-border/40 text-text-muted hover:text-accent hover:border-accent/60"
                }`}
              >
                {listening ? (
                  // stop icon
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  // mic icon
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                )}
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  title="Pause AI response"
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-crisis/15 border border-crisis/40 px-3.5 py-1 text-xs font-bold text-crisis hover:bg-crisis hover:text-bg transition-all shadow-sm"
                >
                  <span className="text-xs">⏹</span>
                  <span>Pause AI</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSendDisabled}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-1 text-xs font-semibold text-bg transition-all hover:bg-accent-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-30 shadow-sm"
                >
                  <span>Send</span>
                  <span aria-hidden="true" className="text-xs">➔</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
