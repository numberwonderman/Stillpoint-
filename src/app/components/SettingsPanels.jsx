"use client";

import LocalAIPanel from "./LocalAIPanel";

/**
 * SettingsPanels — the Local AI mode panel.
 * Cloud mode uses a server-held Gemini API key (no UI needed here); only
 * Local AI mode's internals (device detection, tier picker, download
 * progress, privacy modal) live in LocalAIPanel. This component just wires
 * the props through to the orchestration hook.
 */
export default function SettingsPanels({
  localAISupported,
  localAIEnabled,
  selectedTier,
  downloadState,
  downloadProgress,
  downloadText,
  localAIStatus,
  localAIInferring,
  onEnableLocalAI,
  onDisableLocalAI,
  onSelectTier,
  onStartDownload,
  onCancelDownload,
}) {
  return (
    <div className="mb-7 grid gap-4">
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
          localAIStatus={localAIStatus}
          localAIInferring={localAIInferring}
          onEnable={onEnableLocalAI}
          onDisable={onDisableLocalAI}
          onStartDownload={onStartDownload}
          onCancelDownload={onCancelDownload}
        />
      </details>
    </div>
  );
}
