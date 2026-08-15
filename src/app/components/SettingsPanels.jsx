"use client";

import { useState } from "react";

/**
 * SettingsPanels — the two <details> panels: Gemini API key + Local AI toggle.
 * Replaces the inline <script> that wired the original index.html buttons.
 * Props mirror the public surface of the old app.js: setApiKey, clearApiKey,
 * setLocalAIMode, plus a `localAISupported` flag to disable the toggle
 * on browsers without WebGPU.
 */
export default function SettingsPanels({
  localAISupported,
  onSaveKey,
  onClearKey,
  onToggleLocalAI,
}) {
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState("");
  const [localAIStatus, setLocalAIStatus] = useState(
    localAISupported ? "" : "Not supported in this browser (requires WebGPU)."
  );

  function handleSaveKey() {
    onSaveKey(keyInput);
    setKeyStatus(
      keyInput.trim() ? "Key saved for this session." : "Please enter a key first."
    );
  }

  function handleClearKey() {
    onClearKey();
    setKeyInput("");
    setKeyStatus("Key cleared.");
  }

  function handleToggleLocalAI(e) {
    const enabled = e.target.checked;
    onToggleLocalAI(enabled);
    setLocalAIStatus(
      enabled
        ? "Local AI mode on. The model loads once you submit."
        : "Using Gemini (cloud)."
    );
  }

  return (
    <>
      {/* -------- Gemini API key panel -------- */}
      <details className="mb-7 rounded-[10px] border border-border bg-surface px-5 py-4">
        <summary className="cursor-pointer py-1 text-[1.0625rem] font-bold">
          Settings — Gemini API key
        </summary>
        <div className="pt-4">
          <p className="mb-4 text-base text-text-muted">
            Stillpoint uses your own Gemini API key. Your key is kept only in this
            browser tab&apos;s memory — it is never saved to disk and clears when you
            close the page.
          </p>
          <p className="mb-4 text-base text-text-muted">
            Don&apos;t have a key yet? Get one free from{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google AI Studio
            </a>
            .
          </p>
          <label htmlFor="apiKeyInput" className="mb-2 block font-bold">
            Gemini API key
          </label>
          <input
            type="password"
            id="apiKeyInput"
            name="apiKeyInput"
            autoComplete="off"
            placeholder="Paste your API key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-full rounded-[10px] border border-border bg-surface-raised px-4 py-3 text-[1.0625rem] text-text"
          />
          <div className="mt-3 flex flex-wrap gap-3 sm:flex-col">
            <button
              type="button"
              onClick={handleSaveKey}
              className="min-h-12 rounded-[10px] bg-accent px-6 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:bg-accent-strong hover:text-text sm:w-full"
            >
              Save key for this session
            </button>
            <button
              type="button"
              onClick={handleClearKey}
              className="min-h-12 rounded-[10px] border-2 border-border bg-transparent px-6 py-3 text-[1.0625rem] font-bold text-text transition-colors hover:border-accent sm:w-full"
            >
              Clear key
            </button>
          </div>
          <p className="key-status mt-3 min-h-[1.4em] text-[0.95rem] text-accent" aria-live="polite">
            {keyStatus}
          </p>
        </div>
      </details>

      {/* -------- Local AI mode panel -------- */}
      <details className="mb-7 rounded-[10px] border border-border bg-surface px-5 py-4">
        <summary className="cursor-pointer py-1 text-[1.0625rem] font-bold">
          Settings — Local AI mode
        </summary>
        <div className="pt-4">
          <p className="mb-4 text-base text-text-muted">
            Local AI mode runs a small model entirely in this browser tab
            — nothing is sent anywhere, even the short summary. It requires
            a browser with WebGPU support and downloads a one-time model file
            the first time you use it each session.
          </p>
          <label htmlFor="localAIToggle" className="mb-2 block font-bold">
            <input
              type="checkbox"
              id="localAIToggle"
              name="localAIToggle"
              disabled={!localAISupported}
              onChange={handleToggleLocalAI}
              className="mr-2"
            />
            Use Local AI mode instead of Gemini
          </label>
          <p className="key-status mt-3 min-h-[1.4em] text-[0.95rem] text-accent" aria-live="polite">
            {localAIStatus}
          </p>
        </div>
      </details>
    </>
  );
}
