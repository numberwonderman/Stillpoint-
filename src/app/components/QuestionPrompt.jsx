"use client";

import { useState, useCallback } from "react";

/**
 * Extracts the last question sentence from an assistant message.
 * Returns null if no question is found.
 */
export function extractQuestion(text) {
  if (!text || typeof text !== "string") return null;
  // Split on sentence-ending punctuation, keep delimiter
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [];
  // Walk backwards for the last sentence that ends with "?"
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    if (s.endsWith("?") && s.length > 4) {
      return s;
    }
  }
  // Fallback: check if the entire text ends with "?" (short messages)
  const trimmed = text.trim();
  if (trimmed.endsWith("?") && trimmed.length > 4) return trimmed;
  return null;
}

/**
 * Derive a small set of empathetic quick-reply suggestions based on the question.
 * These are gentle prompts — not definitive answers — that help users open up.
 */
function deriveChips(question) {
  const q = question.toLowerCase();

  if (q.includes("how long") || q.includes("how long have")) {
    return ["Just started recently", "For a while now", "It comes and goes", "I'm not sure"];
  }
  if (q.includes("sleep") || q.includes("rest")) {
    return ["Not sleeping well", "Sleeping too much", "It varies a lot", "Sleep is okay"];
  }
  if (q.includes("feel") || q.includes("feeling") || q.includes("emotion")) {
    return ["Anxious and on edge", "Sad and low", "Numb or empty", "Overwhelmed", "I don't know"];
  }
  if (q.includes("support") || q.includes("people") || q.includes("someone")) {
    return ["Not really", "A little", "Yes, a few people", "I'd rather not say"];
  }
  if (q.includes("happen") || q.includes("started") || q.includes("trigger")) {
    return ["Something specific happened", "It built up over time", "I can't pinpoint it", "Skip this"];
  }
  if (q.includes("work") || q.includes("job") || q.includes("school")) {
    return ["It's very stressful", "It's been hard lately", "That's not the main thing", "Skip"];
  }
  if (q.includes("want") || q.includes("help") || q.includes("looking for")) {
    return ["Just to talk", "Practical advice", "To understand myself better", "I'm not sure"];
  }
  if (q.includes("often") || q.includes("frequency") || q.includes("how frequent")) {
    return ["Most of the time", "Several times a day", "Occasionally", "Rarely"];
  }
  if (q.includes("think") || q.includes("thought")) {
    return ["Yes, often", "Sometimes", "Rarely", "I'd rather not answer"];
  }

  // Generic empathetic fallbacks
  return ["Tell me more", "Not sure how to put it", "I'd rather skip this", "I want to talk about it"];
}

/**
 * QuestionPrompt — shown below the last assistant message when it contains a question.
 *
 * Props:
 *   question   {string}    The detected question from the AI response
 *   onReply    {function}  Called with the selected/typed reply string
 *   onDismiss  {function}  Called when the user closes the card
 */
export default function QuestionPrompt({ question, onReply, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [customText, setCustomText] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const chips = deriveChips(question);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setDismissed(true);
      onDismiss?.();
    }, 280);
  }, [onDismiss]);

  const handleReply = useCallback(
    (text) => {
      if (!text.trim()) return;
      onReply?.(text.trim());
      setVisible(false);
      setTimeout(() => setDismissed(true), 280);
    },
    [onReply]
  );

  const handleChip = useCallback((chip) => handleReply(chip), [handleReply]);

  const handleCustomSubmit = useCallback(() => {
    handleReply(customText);
  }, [customText, handleReply]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCustomSubmit();
      }
    },
    [handleCustomSubmit]
  );

  if (dismissed) return null;

  const canSend = customText.trim().length > 0;

  return (
    <div
      aria-live="polite"
      className="question-prompt-wrapper"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.28s cubic-bezier(0.16,1,0.3,1), transform 0.28s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Card */}
      <div
        style={{
          position: "relative",
          background: "linear-gradient(135deg, rgba(28,38,45,0.97) 0%, rgba(21,29,34,0.97) 100%)",
          border: "1px solid rgba(111,191,174,0.25)",
          borderRadius: "16px",
          padding: "16px 18px 14px",
          boxShadow: "0 8px 32px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(111,191,174,0.08) inset",
          backdropFilter: "blur(12px)",
          maxWidth: "520px",
          width: "100%",
        }}
      >
        {/* Top row: pulse dot + question text + close */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
          {/* Pulse dot */}
          <div
            style={{
              marginTop: "4px",
              flexShrink: 0,
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--color-accent)",
              boxShadow: "0 0 8px rgba(111,191,174,0.6)",
              animation: "question-pulse 2.4s ease-in-out infinite",
            }}
          />

          {/* Question text */}
          <p
            style={{
              margin: 0,
              flex: 1,
              fontSize: "0.875rem",
              lineHeight: 1.55,
              color: "var(--color-text)",
              fontWeight: 500,
            }}
          >
            {question}
          </p>

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss question prompt"
            style={{
              flexShrink: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
              borderRadius: "6px",
              color: "var(--color-text-muted)",
              fontSize: "1rem",
              lineHeight: 1,
              transition: "color 0.15s, background 0.15s",
              marginTop: "-2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text)";
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
              e.currentTarget.style.background = "none";
            }}
          >
            ✕
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            background: "linear-gradient(90deg, rgba(111,191,174,0.2) 0%, transparent 100%)",
            marginBottom: "12px",
          }}
        />

        {/* Quick-reply chips */}
        <div
          role="group"
          aria-label="Quick reply options"
          style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}
        >
          {chips.map((chip, i) => (
            <QuickReplyChip key={i} label={chip} onClick={() => handleChip(chip)} delay={i * 45} />
          ))}
        </div>

        {/* Custom reply input */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            borderRadius: "12px",
            border: inputFocused
              ? "1px solid rgba(111,191,174,0.55)"
              : "1px solid rgba(111,191,174,0.18)",
            background: inputFocused
              ? "rgba(111,191,174,0.06)"
              : "rgba(255,255,255,0.03)",
            padding: "8px 8px 8px 12px",
            transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
            boxShadow: inputFocused
              ? "0 0 0 3px rgba(111,191,174,0.1)"
              : "none",
          }}
        >
          <textarea
            rows={1}
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
              // Auto-grow up to ~4 rows
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Or write your own reply…"
            aria-label="Type a custom reply"
            style={{
              flex: 1,
              resize: "none",
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontSize: "0.8375rem",
              lineHeight: 1.5,
              fontFamily: "inherit",
              minHeight: "22px",
              maxHeight: "96px",
              overflowY: "auto",
              padding: 0,
            }}
          />

          {/* Send button */}
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!canSend}
            aria-label="Send custom reply"
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              borderRadius: "8px",
              border: "none",
              cursor: canSend ? "pointer" : "default",
              background: canSend
                ? "var(--color-accent)"
                : "rgba(111,191,174,0.12)",
              color: canSend ? "var(--color-bg)" : "rgba(111,191,174,0.35)",
              transition: "background 0.18s, transform 0.14s, color 0.18s",
              transform: canSend ? "scale(1)" : "scale(0.92)",
            }}
            onMouseEnter={(e) => {
              if (canSend) e.currentTarget.style.background = "var(--color-accent-strong)";
            }}
            onMouseLeave={(e) => {
              if (canSend) e.currentTarget.style.background = "var(--color-accent)";
            }}
          >
            {/* Arrow-up send icon */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 12V3M7 3L3 7M7 3l4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Footer hint */}
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "0.71rem",
            color: "var(--color-text-muted)",
            opacity: 0.65,
            lineHeight: 1.4,
          }}
        >
          Enter to send · Shift+Enter for new line · Close to skip
        </p>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes question-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(111,191,174,0.6); }
          50%       { opacity: 0.5; box-shadow: 0 0 3px rgba(111,191,174,0.2); }
        }
        @keyframes chip-appear {
          from { opacity: 0; transform: translateY(4px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

/** Individual quick-reply chip button */
function QuickReplyChip({ label, onClick, delay = 0 }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Reply: ${label}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(111,191,174,0.18)"
          : "rgba(111,191,174,0.07)",
        border: hovered
          ? "1px solid rgba(111,191,174,0.5)"
          : "1px solid rgba(111,191,174,0.2)",
        borderRadius: "20px",
        padding: "6px 14px",
        fontSize: "0.8125rem",
        color: hovered ? "var(--color-accent)" : "var(--color-text-muted)",
        cursor: "pointer",
        transition: "all 0.18s cubic-bezier(0.16,1,0.3,1)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered ? "0 2px 10px rgba(111,191,174,0.15)" : "none",
        lineHeight: 1.35,
        fontWeight: hovered ? 500 : 400,
        animation: `chip-appear 0.3s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      }}
    >
      {label}
    </button>
  );
}
