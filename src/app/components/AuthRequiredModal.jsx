"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * AuthRequiredModal — shown when the cloud path returns 401.
 *
 * The user submitted text on the cloud path, but they aren't signed in
 * (or their session expired). Instead of dumping a generic "Your
 * session has expired" string, we offer two clear, equal-weight
 * next steps:
 *
 *   1. Sign in / Sign up so they can keep using the cloud model.
 *   2. Switch to Local AI mode right here in-place, with no redirect
 *      and no extra dialogs.
 *
 * The modal is focus-trapped, esc-dismissible, and restores focus to
 * the trigger when closed. Choosing a path (sign in or Local AI) is
 * always a single click.
 *
 * Props:
 *   - open: boolean
 *   - mode: "expired" | "anonymous" — the headline is slightly different
 *     for "your session has expired" vs "you need to sign in to use
 *     the cloud model". Detected by the hook based on whether /api/auth/me
 *     returned a user.
 *   - localAISupported: whether the user's browser can run the on-device
 *     model. If false, the Local AI option is hidden.
 *   - localAIReady: whether the model has already been downloaded.
 *   - onEnableLocalAI: enables local AI mode and starts the download
 *     if necessary (defined in the hook). Goes through the same
 *     confirmation flow as the settings panel.
 *   - onClose: dismiss the modal (returns to the form so the user can
 *     edit their text and try again).
 */
export default function AuthRequiredModal({
  open,
  mode = "anonymous",
  localAISupported = false,
  localAIReady = false,
  onEnableLocalAI,
  onClose,
}) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Focus the close button on open, restore focus on close, and trap
  // Tab inside the dialog while it's open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;

    // Defer focus until the next frame so the dialog is mounted.
    const t = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
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
  }, [open, onClose]);

  if (!open) return null;

  const headline =
    mode === "expired"
      ? "Your session expired"
      : "Sign in to use the cloud model";
  const body =
    mode === "expired"
      ? "Your cloud session ended, so we couldn't send your last message. You can sign in again, or switch to Local AI mode and keep going with nothing leaving your browser."
      : "The cloud model needs you to be signed in. Or you can switch to Local AI mode and keep going with nothing leaving your browser.";

  function goLogin() {
    // Preserve the user's text in localStorage so they can resume after
    // signing in. Read the input value directly so we don't depend on
    // lifting state through the page.
    try {
      const el = document.getElementById("feelingInput");
      if (el && el.value) {
        window.localStorage.setItem("stillpoint:draft", el.value);
      }
    } catch {
      /* best-effort */
    }
    router.push("/login");
  }

  function goSignup() {
    try {
      const el = document.getElementById("feelingInput");
      if (el && el.value) {
        window.localStorage.setItem("stillpoint:draft", el.value);
      }
    } catch {
      /* best-effort */
    }
    router.push("/signup");
  }

  function switchToLocal() {
    onClose?.();
    onEnableLocalAI?.();
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        // Click on the backdrop (not the dialog) dismisses the modal.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-[480px] rounded-[16px] border border-border bg-surface px-6 py-7 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] sm:px-7 sm:py-8"
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>

        <p className="mb-2 text-[0.75rem] font-bold uppercase tracking-[0.16em] text-accent">
          Sign in needed
        </p>
        <h2
          id="auth-modal-title"
          className="mb-3 text-[1.5rem] font-bold leading-tight text-text"
        >
          {headline}
        </h2>
        <p className="mb-6 text-[1rem] leading-relaxed text-text-muted">
          {body}
        </p>

        <div className="space-y-3">
          {/* Primary path — sign in. The dominant action. */}
          <button
            type="button"
            onClick={goLogin}
            className="flex w-full min-h-[3.25rem] items-center justify-center gap-2 rounded-[10px] bg-accent px-5 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:bg-accent-strong"
          >
            <span aria-hidden="true">🔑</span>
            <span>Log in</span>
          </button>

          {/* Secondary — sign up. Equal weight, slightly muted style so
              returning users still see Log in as the primary. */}
          <button
            type="button"
            onClick={goSignup}
            className="flex w-full min-h-[3.25rem] items-center justify-center gap-2 rounded-[10px] border-2 border-border bg-transparent px-5 py-3 text-[1.0625rem] font-bold text-text transition-colors hover:border-accent hover:text-accent"
          >
            <span aria-hidden="true">✨</span>
            <span>Create a free account</span>
          </button>

          {/* Local AI — equally easy to reach, but framed as the
              privacy-first alternative. Hidden entirely if the browser
              can't run it. */}
          {localAISupported && (
            <>
              <div className="flex items-center gap-3 py-1 text-[0.85rem] uppercase tracking-[0.12em] text-text-muted">
                <span className="h-px flex-1 bg-border" />
                <span>or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                type="button"
                onClick={switchToLocal}
                className="flex w-full min-h-[3.25rem] items-center justify-center gap-2 rounded-[10px] border-2 border-accent/40 bg-surface-raised px-5 py-3 text-left text-text transition-colors hover:border-accent"
              >
                <span aria-hidden="true" className="text-[1.2em]">💻</span>
                <span className="flex flex-col">
                  <span className="text-[1.0625rem] font-bold leading-tight">
                    {localAIReady ? "Use Local AI mode" : "Switch to Local AI"}
                  </span>
                  <span className="text-[0.85rem] font-normal leading-tight text-text-muted">
                    Nothing leaves your browser — {localAIReady ? "model is ready" : "one-time download"}
                  </span>
                </span>
              </button>
            </>
          )}

          {!localAISupported && (
            <p className="rounded-[10px] border border-border/60 bg-bg/40 p-3 text-[0.9rem] leading-relaxed text-text-muted">
              <strong className="text-text">Heads up:</strong> your browser
              doesn&apos;t support on-device mode, so signing in is the
              only way to get a response.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
