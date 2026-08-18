"use client";

import { useEffect, useState } from "react";

/**
 * Toast — a subtle top-center notification banner.
 * Automatically dismisses after `duration` ms (default 3000).
 * Supports "info", "success", and "warning" variants.
 */
export default function Toast({ message, variant = "info", duration = 3500, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 300); // wait for fade-out
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const icons = {
    info: "🔄",
    success: "✅",
    warning: "⚠️",
  };

  const colors = {
    info: "bg-surface-raised border-accent/40 text-text",
    success: "bg-surface-raised border-accent/60 text-accent",
    warning: "bg-surface-raised border-crisis/40 text-crisis",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed top-4 left-1/2 z-[9999] -translate-x-1/2
        flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-xl
        text-sm font-medium backdrop-blur-md
        transition-all duration-300
        ${colors[variant] ?? colors.info}
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}
      `}
    >
      <span>{icons[variant] ?? "ℹ️"}</span>
      <span>{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss?.(), 300);
        }}
        aria-label="Dismiss"
        className="ml-1 text-text-muted hover:text-text transition-colors text-xs"
      >
        ✕
      </button>
    </div>
  );
}
