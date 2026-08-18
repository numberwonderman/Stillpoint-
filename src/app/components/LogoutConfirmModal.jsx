"use client";

import { useEffect, useRef } from "react";

/**
 * LogoutConfirmModal — shown before ending the user's session.
 *
 * Logging out silently is risky in a sensitive app like this: a stray
 * click on "Log out" can drop someone out of an ongoing conversation
 * without warning. This modal asks the user to confirm the action,
 * mirrors the focus / Esc / backdrop-click patterns used elsewhere in
 * the app (AuthRequiredModal, PrivacyModal), and exposes a single
 * `onConfirm` callback that performs the actual sign-out.
 *
 * Props:
 *   - open: boolean — controls visibility
 *   - onConfirm: () => void — called when the user clicks "Log out"
 *   - onCancel: () => void — called on Esc, backdrop click, or "Stay signed in"
 */
export default function LogoutConfirmModal({ open, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;

    // Focus "Stay signed in" by default — the destructive action shouldn't
    // be the easy-to-hit target. The user has to opt in by clicking it.
    const t = setTimeout(() => {
      cancelRef.current?.focus();
    }, 0);

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
        return;
      }
      // Enter on the cancel button should NOT trigger logout — only an
      // explicit click on "Log out" should. We don't intercept Enter
      // globally so the focused button handles it natively.
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* element may have unmounted */
        }
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
        aria-describedby="logout-modal-desc"
        className="relative w-full max-w-[440px] rounded-[16px] border border-border bg-surface px-6 py-7 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] sm:px-7 sm:py-8"
      >
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crisis/15 text-xl"
          >
            ⏏
          </span>
          <h2
            id="logout-modal-title"
            className="m-0 text-[1.25rem] font-bold leading-tight text-text"
          >
            Log out of Stillpoint?
          </h2>
        </div>

        <p
          id="logout-modal-desc"
          className="mb-6 text-[0.95rem] leading-relaxed text-text-muted"
        >
          You&apos;ll need to sign in again to continue your conversations on
          this device. Anything you haven&apos;t sent yet will stay here.
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[2.75rem] rounded-[10px] border-2 border-border bg-transparent px-5 py-2.5 text-[0.95rem] font-bold text-text transition-colors hover:border-accent hover:text-accent sm:min-h-[3rem]"
          >
            Stay signed in
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="min-h-[2.75rem] rounded-[10px] bg-crisis px-5 py-2.5 text-[0.95rem] font-bold text-bg transition-colors hover:bg-crisis/90 sm:min-h-[3rem]"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
