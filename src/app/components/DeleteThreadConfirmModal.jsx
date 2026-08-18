"use client";

import { useEffect, useRef } from "react";

/**
 * DeleteThreadConfirmModal — Confirmation dialog for deleting an individual conversation thread.
 */
export default function DeleteThreadConfirmModal({ open, threadTitle, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm animate-backdrop-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-thread-modal-title"
        aria-describedby="delete-thread-modal-desc"
        className="w-full max-w-[420px] rounded-2xl border border-border/80 bg-surface/95 p-6 shadow-2xl backdrop-blur-xl animate-modal-pop text-text"
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crisis/15 text-xl text-crisis"
          >
            🗑️
          </span>
          <h2 id="delete-thread-modal-title" className="m-0 text-lg font-bold text-text">
            Delete conversation?
          </h2>
        </div>

        <p id="delete-thread-modal-desc" className="mb-5 text-sm leading-relaxed text-text-muted">
          Are you sure you want to delete <strong className="text-text">&quot;{threadTitle || "Untitled Conversation"}&quot;</strong>? This will permanently remove it from your device.
        </p>

        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[2.75rem] flex-1 rounded-xl border border-border/80 bg-surface-raised px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-raised/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[2.75rem] flex-1 rounded-xl bg-crisis px-4 py-2 text-sm font-bold text-bg transition-colors hover:bg-crisis/90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
