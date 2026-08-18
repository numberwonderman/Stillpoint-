"use client";

import { useEffect, useRef } from "react";

/**
 * PrivacyModal — shown once before Local AI mode is switched on.
 * Explains the trade-off plainly: nothing leaves the device, but a small
 * on-device model can't match a large cloud model's response quality.
 *
 * Accessible dialog: focus moves to the primary action on open, Escape
 * cancels, and the overlay is aria-hidden from the rest of the page via
 * aria-modal + role="dialog".
 */
export default function PrivacyModal({ open, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-heading"
        aria-describedby="privacy-modal-desc"
        className="w-full max-w-[440px] rounded-card border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xl"
          >
            🔒
          </span>
          <h2 id="privacy-modal-heading" className="m-0 text-xl font-bold">
            Maximum privacy mode
          </h2>
        </div>

        <p id="privacy-modal-desc" className="mb-3 text-base text-text-muted">
          Local AI mode runs entirely on your device. Nothing is ever sent to any server.
        </p>
        <p className="mb-5 rounded-[10px] border border-focus/40 bg-focus/10 px-4 py-3 text-[0.95rem] text-text">
          <strong>Trade-off:</strong> the on-device model is much smaller than
          the cloud model, so response quality might suffer — replies can be
          shorter, less nuanced, or occasionally repetitive.
        </p>

        <div className="flex flex-wrap gap-3 sm:flex-col">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="min-h-12 flex-1 rounded-[10px] bg-accent px-6 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:bg-accent-strong hover:text-text"
          >
            Continue with max privacy
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 flex-1 rounded-[10px] border-2 border-border bg-transparent px-6 py-3 text-[1.0625rem] font-bold text-text transition-colors hover:border-accent"
          >
            Stay on cloud (Gemini)
          </button>
        </div>
      </div>
    </div>
  );
}
