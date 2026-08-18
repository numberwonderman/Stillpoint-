"use client";

import { useEffect, useRef } from "react";

/**
 * ClearAllConfirmModal — Confirmation dialog for deleting all local chats.
 */
export default function ClearAllConfirmModal({ open, onConfirm, onCancel }) {
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
        aria-labelledby="clear-modal-title"
        aria-describedby="clear-modal-desc"
        className="w-full max-w-[420px] rounded-2xl border border-border/80 bg-surface/95 p-6 shadow-2xl backdrop-blur-xl animate-modal-pop"
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crisis/15 text-xl"
          >
            🗑️
          </span>
          <h2 id="clear-modal-title" className="m-0 text-lg font-bold text-text">
            Clear all conversations?
          </h2>
        </div>

        <p id="clear-modal-desc" className="mb-5 text-sm leading-relaxed text-text-muted">
          This will permanently remove all stored conversation threads from this device. This action cannot be undone.
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
            Clear all chats
          </button>
        </div>
      </div>
    </div>
  );
}
