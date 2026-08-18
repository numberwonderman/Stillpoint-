"use client";

import { useState } from "react";
import DeleteThreadConfirmModal from "./DeleteThreadConfirmModal";

/**
 * ThreadList — list of active and previous chat threads.
 * Highlights current thread, reveals trash icon on hover, and prompts confirmation modal before deletion.
 */
export default function ThreadList({ threads, activeThreadId, onSelectThread, onDeleteThread }) {
  const [threadToDelete, setThreadToDelete] = useState(null);

  if (!threads || threads.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-text-muted/60">
        No past conversations.
      </div>
    );
  }

  function handleConfirmDelete() {
    if (threadToDelete && onDeleteThread) {
      onDeleteThread(threadToDelete.id);
    }
    setThreadToDelete(null);
  }

  return (
    <>
      <div className="space-y-0.5 px-2">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          const timeAgo = formatTimeAgo(thread.createdAt);

          return (
            <div
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              className={`group relative flex cursor-pointer items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[0.85rem] transition-colors ${
                isActive
                  ? "bg-surface-raised font-semibold text-text"
                  : "text-text-muted hover:bg-surface-raised/50 hover:text-text"
              }`}
            >
              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate m-0 leading-tight">
                  {thread.title || "Untitled Conversation"}
                </p>
                <span className="text-[0.7rem] font-normal text-text-muted/60">
                  {timeAgo}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setThreadToDelete(thread);
                }}
                title="Delete chat"
                aria-label={`Delete chat ${thread.title}`}
                className="opacity-0 group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-[6px] text-text-muted transition-all hover:bg-crisis/15 hover:text-crisis focus-visible:opacity-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <DeleteThreadConfirmModal
        open={!!threadToDelete}
        threadTitle={threadToDelete?.title}
        onConfirm={handleConfirmDelete}
        onCancel={() => setThreadToDelete(null)}
      />
    </>
  );
}

function formatTimeAgo(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
