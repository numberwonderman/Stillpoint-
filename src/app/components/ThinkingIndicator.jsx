"use client";

/**
 * ThinkingIndicator — an animated "thinking…" affordance.
 *
 * Renders three dots that pulse in sequence to make it visually obvious
 * that work is happening on-device, even when the underlying status
 * string itself isn't changing. Used while the WASM worker is preparing,
 * compiling, or actively generating tokens.
 *
 * The dots are pure CSS (no JS timers); the staggered animation lives
 * in the className below. A screen-reader-only label provides the
 * accessible text equivalent.
 */
export default function ThinkingIndicator({ label = "Thinking on-device", className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 align-baseline ${className}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className="flex items-center gap-[3px]">
        <span
          className="thinking-dot h-1.5 w-1.5 rounded-full bg-current"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="thinking-dot h-1.5 w-1.5 rounded-full bg-current"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="thinking-dot h-1.5 w-1.5 rounded-full bg-current"
          style={{ animationDelay: "300ms" }}
        />
      </span>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="ml-1">
        {label}…
      </span>
    </span>
  );
}
