"use client";

import { useState } from "react";

/**
 * InputSection — textarea + submit button.
 * Submit is triggered on click or Ctrl/Cmd+Enter from inside the textarea
 * (preserves the keyboard shortcut from the original index.html without
 * breaking plain Enter-for-newline).
 */
export default function InputSection({ onSubmit }) {
  const [value, setValue] = useState("");

  function handleClick() {
    onSubmit(value);
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit(value);
    }
  }

  return (
    <section aria-labelledby="input-heading" className="mb-7">
      <h2 id="input-heading" className="mb-2 text-[1.375rem] font-bold">
        How are you feeling right now?
      </h2>
      <p className="mb-4 text-base text-text-muted">
        Write as much or as little as you&apos;d like. Nothing you type here leaves
        your device — only a short summary of the emotions themselves does.
      </p>
      <label htmlFor="feelingInput" className="sr-only">
        Describe how you&apos;re feeling
      </label>
      <textarea
        id="feelingInput"
        name="feelingInput"
        rows={6}
        placeholder="I've been feeling…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full resize-y rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[1.0625rem] leading-relaxed text-text"
        style={{ minHeight: "8rem" }}
      />
      <button
        type="button"
        onClick={handleClick}
        className="primary-action mt-4 block w-full min-h-12 rounded-[10px] bg-accent px-6 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:bg-accent-strong hover:text-text"
      >
        Share how I feel
      </button>
    </section>
  );
}
