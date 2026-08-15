"use client";

import { useState } from "react";
import LocalAIPanel from "./LocalAIPanel";

/**
 * SettingsPanels — the two <details> panels: Gemini API key + Local AI mode.
 * Local AI mode's internals (device detection, tier picker, download
 * progress, privacy modal) live in LocalAIPanel; this component just wires
 * its props through to the orchestration hook.
 */
export default function SettingsPanels({
  localAISupported,
  localAIEnabled,
  selectedTier,
  downloadState,
  downloadProgress,
  downloadText,
  onSaveKey,
  onClearKey,
  onEnableLocalAI,
  onDisableLocalAI,
  onSelectTier,
  onStartDownload,
  onCancelDownload,
}) {
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState("");

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

  return (
    <div className="mb-7 grid gap-4">
      {/* -------- Gemini API key panel -------- */}
      <details className="group rounded-card border border-border bg-surface px-5 py-4 open:shadow-lg">
        <summary className="flex cursor-pointer items-center justify-between py-1 text-[1.0625rem] font-bold marker:content-none">
          <span className="flex items-center gap-2">
            <span aria-hidden="true">☁️</span> Settings — Gemini API key
          </span>
          <span className="text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">
            ⌄
          </span>
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
              className="text-accent underline underline-offset-2 hover:text-accent-strong"
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
          <p className="mt-3 min-h-[1.4em] text-[0.95rem] text-accent" aria-live="polite">
            {keyStatus}
          </p>
        </div>
      </details>

      {/* -------- Local AI mode panel -------- */}
      <details className="group rounded-card border border-border bg-surface px-5 py-4 open:shadow-lg">
        <summary className="flex cursor-pointer items-center justify-between py-1 text-[1.0625rem] font-bold marker:content-none">
          <span className="flex items-center gap-2">
            <span aria-hidden="true">💻</span> Settings — Local AI mode
          </span>
          <span className="text-text-muted transition-transform group-open:rotate-180" aria-hidden="true">
            ⌄
          </span>
        </summary>
        <LocalAIPanel
          localAISupported={localAISupported}
          enabled={localAIEnabled}
          selectedTier={selectedTier}
          onSelectTier={onSelectTier}
          downloadState={downloadState}
          downloadProgress={downloadProgress}
          downloadText={downloadText}
          onEnable={onEnableLocalAI}
          onDisable={onDisableLocalAI}
          onStartDownload={onStartDownload}
          onCancelDownload={onCancelDownload}
        />
      </details>
    </div>
  );
}
