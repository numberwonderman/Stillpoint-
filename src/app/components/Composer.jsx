"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Composer — anchored input box at the bottom of the chat container.
 * Auto-growing textarea, send button, key shortcuts, disabled state handling.
 */
export default function Composer({
  onSubmit,
  disabled = false,
  isGenerating = false,
  isDownloading = false,
  localAIEnabled,
  selectedTier,
  onOpenModelModal,
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea based on content height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

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
                : "Type how you're feeling…"
            }
            aria-label="Describe how you're feeling"
            className="w-full max-w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[0.95rem] text-text placeholder:text-text-muted/50 focus:outline-none disabled:opacity-50 break-words"
          />

          <div className="flex items-center justify-between px-3.5 pb-3 pt-1 border-t border-border/20">
            <button
              type="button"
              onClick={onOpenModelModal}
              title="Click to change model settings"
              className="text-xs font-semibold text-text-muted hover:text-accent transition-colors flex items-center gap-1.5 bg-surface-raised/60 hover:bg-surface-raised px-2.5 py-1 rounded-lg border border-border/30"
            >
              {localAIEnabled ? (
                <span>💻 Local AI ({selectedTier || "medium"})</span>
              ) : (
                <span>☁️ Cloud Mode</span>
              )}
              <span className="text-[0.65rem] text-accent font-bold">⚙️</span>
            </button>

            <div className="flex items-center gap-2">
              {isGenerating && text.trim() ? (
                <span className="hidden sm:inline text-xs text-accent font-medium animate-pulse">
                  Waiting for response…
                </span>
              ) : (
                <span className="hidden sm:inline text-xs text-text-muted/60">Press Enter ↵</span>
              )}
              <button
                type="submit"
                disabled={isSendDisabled}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-1 text-xs font-semibold text-bg transition-all hover:bg-accent-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-30 shadow-sm"
              >
                {isGenerating ? (
                  <span>Generating…</span>
                ) : (
                  <>
                    <span>Send</span>
                    <span aria-hidden="true" className="text-xs">➔</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
