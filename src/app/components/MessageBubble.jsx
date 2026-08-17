"use client";

import { CrisisPanel } from "./ResponseSection";

/**
 * MessageBubble — renders a single chat message.
 * User messages: right-aligned, sleek user-bubble.
 * Assistant messages: left-aligned, surface tinted.
 * Crisis assistant messages: renders CrisisPanel inline.
 */
export default function MessageBubble({
  message,
  crisisRegion,
  onChooseCrisisRegion,
}) {
  const { role, text, status, crisis, crisisSeverity, localAIStopped } = message;

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

  return (
    <div className="mb-4 flex justify-start w-full">
      <div className="max-w-[90%] sm:max-w-[85%] rounded-[18px] rounded-tl-[4px] bg-surface border border-border/20 px-5 py-4 text-text shadow-xs break-words overflow-hidden">
        <p className="m-0 whitespace-pre-wrap leading-relaxed text-[0.95rem] sm:text-[1rem] break-words">
          {text}
          {isStreaming && (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[1.1em] w-[0.5ch] translate-y-[0.15em] animate-pulse bg-accent"
            />
          )}
        </p>
      </div>
    </div>
  );
}
