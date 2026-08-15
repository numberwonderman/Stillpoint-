"use client";

import { useEffect, useState } from "react";
import { MODEL_CATALOG, recommendModel } from "@/lib/localai";
import PrivacyModal from "./PrivacyModal";
import ThinkingIndicator from "./ThinkingIndicator";

const TIER_ORDER = ["tiny", "small", "medium", "large"];

/**
 * LocalAIPanel — the "Local AI mode" settings panel.
 *
 * Responsibilities (all client-side, all in this one panel so the
 * download/resume state lives next to the controls that drive it):
 *  - Detect device capability once on mount and recommend a model tier.
 *  - Let the person confirm or override that tier before downloading.
 *  - Show the Privacy modal ("max privacy, quality might suffer") before
 *    the first time Local AI mode is turned on in a session.
 *  - Render a real progress bar for the download, driven by
 *    downloadState/downloadProgress passed down from useStillpoint.
 *  - Offer Cancel / Resume controls — resuming re-calls the same init
 *    path, and the browser's own model cache means already-downloaded
 *    chunks are not re-fetched.
 */
export default function LocalAIPanel({
  localAISupported,
  enabled,
  selectedTier,
  onSelectTier,
  downloadState, // "idle" | "downloading" | "ready" | "error" | "cancelled"
  downloadProgress, // 0..1
  downloadText,
  localAIStatus, // "idle" | "preparing" | "downloading" | "thinking" | "disposing"
  localAIInferring, // boolean — true while the worker is generating
  onEnable,
  onDisable,
  onStartDownload,
  onCancelDownload,
}) {
  const [detecting, setDetecting] = useState(true);
  const [recommendedTier, setRecommendedTier] = useState(null);
  const [deviceNote, setDeviceNote] = useState("");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  useEffect(() => {
    if (!localAISupported) {
      setDetecting(false);
      return;
    }
    let cancelled = false;
    recommendModel().then(({ recommendedTier: tier, signals }) => {
      if (cancelled) return;
      setRecommendedTier(tier);
      setDetecting(false);
      if (!selectedTier) onSelectTier(tier);

      const bits = [];
      if (signals.isMobile) bits.push("mobile device");
      if (typeof signals.deviceMemoryGB === "number") bits.push(`${signals.deviceMemoryGB} GB RAM reported`);
      if (typeof signals.logicalCores === "number") bits.push(`${signals.logicalCores} CPU cores`);
      setDeviceNote(bits.length ? `Detected: ${bits.join(", ")}.` : "");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAISupported]);

  function handleToggleChange(e) {
    const wantsEnabled = e.target.checked;
    if (wantsEnabled) {
      setShowPrivacyModal(true);
    } else {
      onDisable();
    }
  }

  function handlePrivacyConfirm() {
    setShowPrivacyModal(false);
    onEnable();
  }

  function handlePrivacyCancel() {
    setShowPrivacyModal(false);
  }

  const pct = Math.round((downloadProgress || 0) * 100);
  const activeTier = selectedTier || recommendedTier || "medium";

  return (
    <div className="pt-4">
      <p className="mb-4 text-base text-text-muted">
        Local AI mode runs a small model entirely in this browser tab —
        nothing is sent anywhere, even the short summary. It requires a
        browser with WebGPU support and downloads a one-time model file.
      </p>

      <label htmlFor="localAIToggle" className="mb-1 flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          id="localAIToggle"
          name="localAIToggle"
          checked={enabled}
          disabled={!localAISupported}
          onChange={handleToggleChange}
          className="h-5 w-5 accent-accent"
        />
        Use Local AI mode instead of Gemini
      </label>

      {!localAISupported && (
        <p className="mt-2 text-[0.95rem] text-crisis">
          Not supported in this browser (requires WebGPU).
        </p>
      )}

      {localAISupported && (
        <div className="mt-4 rounded-[10px] border border-border bg-surface-raised p-4">
          <h3 className="mb-1 text-[1.0625rem] font-bold">On-device model</h3>
          <p className="mb-3 text-[0.9rem] text-text-muted">
            {detecting
              ? "Checking your device to recommend a model size…"
              : deviceNote || "Pick a model size below."}
          </p>

          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-1">
            {TIER_ORDER.map((tierKey) => {
              const model = MODEL_CATALOG[tierKey];
              const isSelected = activeTier === tierKey;
              const isRecommended = recommendedTier === tierKey;
              return (
                <button
                  key={tierKey}
                  type="button"
                  onClick={() => onSelectTier(tierKey)}
                  disabled={downloadState === "downloading"}
                  aria-pressed={isSelected}
                  className={`rounded-[10px] border-2 px-3 py-2 text-left text-[0.9rem] transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface hover:border-accent/60"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="flex items-center justify-between font-bold">
                    {model.label} · {model.params}
                    {isRecommended && (
                      <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-[0.7rem] font-bold text-accent">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="block text-text-muted">{model.approxSizeLabel}</span>
                </button>
              );
            })}
          </div>

          <DownloadStatus
            state={downloadState}
            progressPct={pct}
            text={downloadText}
            modelLabel={MODEL_CATALOG[activeTier].label}
            localAIStatus={localAIStatus}
            localAIInferring={localAIInferring}
            onStart={() => onStartDownload(activeTier)}
            onResume={() => onStartDownload(activeTier)}
            onCancel={onCancelDownload}
          />
        </div>
      )}

      <PrivacyModal
        open={showPrivacyModal}
        onConfirm={handlePrivacyConfirm}
        onCancel={handlePrivacyCancel}
      />
    </div>
  );
}

function DownloadStatus({ state, progressPct, text, modelLabel, localAIStatus, localAIInferring, onStart, onResume, onCancel }) {
  if (state === "ready") {
    return (
      <p className="flex items-center gap-2 text-[0.95rem] font-bold text-accent" aria-live="polite">
        <span aria-hidden="true">✓</span> {modelLabel} model ready on-device.
        {localAIInferring && (
          <span className="ml-1 font-normal text-text-muted">
            <ThinkingIndicator label="Thinking on-device" />
          </span>
        )}
      </p>
    );
  }

  // While the worker is compiling WASM or otherwise preparing before any
  // progress events arrive, surface that so the user doesn't think the
  // page is stuck.
  if (state === "downloading" && localAIStatus === "preparing" && progressPct === 0) {
    return (
      <div aria-live="polite" className="flex items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-2 text-[0.9rem] text-text-muted">
          <ThinkingIndicator label={text || "Preparing on-device model"} />
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-[8px] border border-border px-3 py-1.5 text-[0.85rem] font-bold hover:border-crisis hover:text-crisis"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state === "downloading") {
    return (
      <div aria-live="polite">
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Downloading ${modelLabel} model`}
          className="mb-2 h-3 w-full overflow-hidden rounded-full bg-bg"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-[0.85rem] text-text-muted">
            {text || `Downloading… ${progressPct}%`}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-[8px] border border-border px-3 py-1.5 text-[0.85rem] font-bold hover:border-crisis hover:text-crisis"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state === "error" || state === "cancelled") {
    return (
      <div aria-live="polite">
        <p className="mb-2 text-[0.9rem] text-crisis">
          {state === "cancelled"
            ? "Download paused."
            : text || "Download failed."}{" "}
          Already-downloaded parts are cached in your browser, so resuming
          won&apos;t start from zero.
        </p>
        <button
          type="button"
          onClick={onResume}
          className="min-h-10 rounded-[10px] bg-accent px-4 py-2 text-[0.95rem] font-bold text-bg hover:bg-accent-strong hover:text-text"
        >
          Resume download
        </button>
      </div>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={onStart}
      className="min-h-10 rounded-[10px] bg-accent px-4 py-2 text-[0.95rem] font-bold text-bg hover:bg-accent-strong hover:text-text"
    >
      Download {modelLabel} model
    </button>
  );
}
