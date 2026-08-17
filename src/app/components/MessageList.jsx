"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ThinkingIndicator from "./ThinkingIndicator";

/**
 * MessageList — scrollable message stream container.
 * Auto-scrolls to bottom on new messages. Renders empty state welcome view when no messages exist.
 */
export default function MessageList({
  messages,
  status,
  error,
  localAIInferring,
  crisisRegion,
  onChooseCrisisRegion,
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom whenever messages or status change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, error]);

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

        {/* Global Status / Error Indicator */}
        {(status || error || localAIInferring) && (
          <div className="my-2 text-center text-sm">
            {localAIInferring ? (
              <ThinkingIndicator label="Thinking on-device" />
            ) : error ? (
              <span className="font-semibold text-crisis">{error}</span>
            ) : status ? (
              <span className="text-text-muted">{status}</span>
            ) : null}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
