"use client";

import { useState, useEffect } from "react";

/**
 * TopBar — header for the main chat area.
 * Displays mobile menu toggle, active thread title (editable inline), and subtle mode badge.
 */
export default function TopBar({
  activeThreadTitle,
  onUpdateTitle,
  localAIEnabled,
  selectedTier,
  onToggleMobileSidebar,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState(activeThreadTitle || "Stillpoint");

  useEffect(() => {
    setTitleInput(activeThreadTitle || "Stillpoint");
  }, [activeThreadTitle]);

  function handleTitleSubmit(e) {
    e.preventDefault();
    if (titleInput.trim()) {
      onUpdateTitle(titleInput.trim());
    }
    setIsEditing(false);
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border/30 bg-surface/30 px-4 w-full max-w-full overflow-hidden">
      {/* Left: Mobile Toggle + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          aria-label="Open sidebar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-raised hover:text-text md:hidden"
        >
          ☰
        </button>

        {isEditing ? (
          <form onSubmit={handleTitleSubmit} className="flex items-center gap-2 min-w-0 flex-1">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              autoFocus
              className="w-full max-w-xs rounded-md border border-border/50 bg-bg px-2 py-0.5 text-xs font-semibold text-text focus:outline-none"
            />
          </form>
        ) : (
          <h2
            onClick={() => setIsEditing(true)}
            title="Click to edit title"
            className="group cursor-pointer truncate text-xs font-semibold text-text-muted transition-colors hover:text-text m-0 flex items-center gap-1.5 min-w-0"
          >
            <span className="truncate">{activeThreadTitle || "Stillpoint"}</span>
            <span className="opacity-0 group-hover:opacity-100 text-[0.7rem] text-text-muted shrink-0">✎</span>
          </h2>
        )}
      </div>

      {/* Right: Mode Pill */}
      <div className="flex items-center gap-2 shrink-0">
        {localAIEnabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[0.75rem] font-medium text-accent">
            <span>💻</span>
            <span>Local AI ({selectedTier || "medium"})</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised/80 px-2.5 py-0.5 text-[0.75rem] font-medium text-text-muted">
            <span>☁️</span>
            <span>Cloud Mode</span>
          </span>
        )}
      </div>
    </header>
  );
}
