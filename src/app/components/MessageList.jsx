"use client";

import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ThinkingIndicator from "./ThinkingIndicator";
import QuestionPrompt, { extractQuestion } from "./QuestionPrompt";

/**
 * MessageList — scrollable message stream container.
 * Auto-scrolls to bottom on new messages. Renders empty state welcome view when no messages exist.
 * Shows rich local AI loading stages: preparing → downloading → thinking.
 */
export default function MessageList({
  messages,
  status,
  error,
  localAIInferring,
  localAIStatus,
  downloadProgress,
  downloadText,
  crisisRegion,
  onChooseCrisisRegion,
  onReply,
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const prevCountRef = useRef(0);
  const prevLastIdRef = useRef(null);
  // Track dismissed question IDs so the prompt doesn't reappear on re-render
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  // Only scroll to bottom when a genuinely new message arrives,
  // or when the last assistant message content grows (streaming).
  // Status / localAIStatus transitions intentionally do NOT trigger
  // a scroll so the loading badge disappearing never jumps the view.
  const msgCount = messages?.length ?? 0;
  const lastMsg = messages?.[msgCount - 1];
  const lastMsgId = lastMsg?.id ?? null;
  const lastMsgContent = lastMsg?.text ?? "";

  useEffect(() => {
    const countGrew = msgCount > prevCountRef.current;
    const idChanged = lastMsgId !== prevLastIdRef.current;
    if (countGrew || idChanged) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = msgCount;
    prevLastIdRef.current = lastMsgId;
  }, [msgCount, lastMsgId]);

  // Also scroll as streaming content grows in the last message
  const prevContentLenRef = useRef(0);
  useEffect(() => {
    const len = lastMsgContent.length;
    if (len > prevContentLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
    prevContentLenRef.current = len;
  }, [lastMsgContent]);

  // Derive a rich status label from localAIStatus
  const localAILoadingLabel = (() => {
    if (localAIStatus === "preparing") return "Preparing on-device model…";
    if (localAIStatus === "downloading") {
      const pct = downloadProgress ? Math.round(downloadProgress * 100) : 0;
      const label = downloadText || "Loading model…";
      return `${label}${pct > 0 && pct < 100 ? ` (${pct}%)` : ""}`;
    }
    if (localAIStatus === "disposing") return "Unloading model…";
    return null;
  })();

  // Find the last done assistant message that contains a question
  const isStreaming = messages?.some((m) => m.role === "assistant" && m.status === "streaming");
  const lastDoneAssistant = !isStreaming
    ? [...(messages || [])].reverse().find(
        (m) => m.role === "assistant" && m.status === "done" && m.text && !m.crisis
      )
    : null;
  const activeQuestion =
    lastDoneAssistant && !dismissedIds.has(lastDoneAssistant.id)
      ? extractQuestion(lastDoneAssistant.text)
      : null;

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 w-full flex-col items-center justify-center p-6 text-center overflow-y-auto">
        {/* Breathing Ring Welcome Graphic */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 border border-accent/40 animate-breathe">
          <span className="text-3xl">🌱</span>
        </div>

        <h2 className="mb-2 text-2xl font-bold tracking-tight text-text">
          Welcome to Stillpoint
        </h2>
        <p className="max-w-md text-base leading-relaxed text-text-muted">
          A calm, private space to process thoughts and emotions — powered by Cloud or on-device Local AI.
        </p>

        {/* Show model-loading indicator even when there are no messages yet */}
        {localAILoadingLabel && (
          <div className="mt-8">
            <LocalAILoadingBadge
              localAIStatus={localAIStatus}
              label={localAILoadingLabel}
              progress={downloadProgress}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 w-full overflow-y-auto p-4 sm:p-6"
    >
      <div className="mx-auto max-w-3xl w-full space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            crisisRegion={crisisRegion}
            onChooseCrisisRegion={onChooseCrisisRegion}
          />
        ))}

        {/* Question prompt — slides in after last AI message when it asks something */}
        {activeQuestion && (
          <div className="flex justify-start w-full px-0 pb-1">
            <QuestionPrompt
              key={lastDoneAssistant.id}
              question={activeQuestion}
              onReply={(text) => {
                setDismissedIds((prev) => new Set(prev).add(lastDoneAssistant.id));
                onReply?.(text);
              }}
              onDismiss={() =>
                setDismissedIds((prev) => new Set(prev).add(lastDoneAssistant.id))
              }
            />
          </div>
        )}

        {/* Global Status / Error Indicator */}
        {(localAILoadingLabel || error || (status && !localAILoadingLabel)) && (
          <div className="my-2 flex flex-col items-center gap-2">
            {localAILoadingLabel ? (
              <LocalAILoadingBadge
                localAIStatus={localAIStatus}
                label={localAILoadingLabel}
                progress={downloadProgress}
              />
            ) : error ? (
              <span className="rounded-lg bg-crisis/10 border border-crisis/30 px-3 py-1.5 text-sm font-semibold text-crisis">
                {error}
              </span>
            ) : status ? (
              <span className="text-sm text-text-muted">{status}</span>
            ) : null}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * LocalAILoadingBadge — rich pill shown while local model is loading/thinking.
 * Shows a progress bar during download, pulsing dots during thinking.
 */
function LocalAILoadingBadge({ localAIStatus, label, progress }) {
  const isDownloading = localAIStatus === "downloading";
  const isThinking = localAIStatus === "thinking";
  const pct = progress ? Math.round(progress * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-accent/30 bg-accent/8 px-5 py-3 min-w-[220px] max-w-xs">
      <div className="flex items-center gap-2 text-sm font-semibold text-accent">
        <span className="text-base">💻</span>
        {isThinking ? (
          <ThinkingIndicator label={label} />
        ) : (
          <span>{label}</span>
        )}
      </div>

      {/* Progress bar during download */}
      {isDownloading && pct > 0 && (
        <div className="w-full h-1.5 rounded-full bg-accent/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {/* Animated progress bar while preparing (indeterminate) */}
      {(localAIStatus === "preparing" || (isDownloading && pct === 0)) && (
        <div className="w-full h-1.5 rounded-full bg-accent/15 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-accent animate-indeterminate-bar" />
        </div>
      )}
    </div>
  );
}
