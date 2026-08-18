"use client";

import { useEffect, useState } from "react";
import { MODEL_CATALOG, recommendModel } from "@/lib/localai";
import PrivacyModal from "./PrivacyModal";
import ThinkingIndicator from "./ThinkingIndicator";

const TIER_ORDER = ["tiny", "small", "medium", "large"];

/**
 * ModelSelectionModal — Centered modal with backdrop blur for configuring
 * execution mode (Cloud vs Local AI) and choosing on-device model tiers.
 */
export default function ModelSelectionModal({
  open,
  onClose,
  user,
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
  storageMode = "session",
  onSetStorageMode,
  onClearAllThreads,
}) {
  const [activeTab, setActiveTab] = useState(localAIEnabled ? "local" : "cloud");
  const [detecting, setDetecting] = useState(true);
  const [recommendedTier, setRecommendedTier] = useState(null);
  const [deviceNote, setDeviceNote] = useState("");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setActiveTab(localAIEnabled ? "local" : "cloud");
  }, [localAIEnabled, open]);

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
      if (typeof signals.deviceMemoryGB === "number") bits.push(`${signals.deviceMemoryGB} GB RAM`);
      if (typeof signals.logicalCores === "number") bits.push(`${signals.logicalCores} CPU cores`);
      setDeviceNote(bits.length ? `Detected: ${bits.join(", ")}.` : "");
    });
    return () => {
      cancelled = true;
    };
  }, [localAISupported, selectedTier, onSelectTier]);

  // Handle ESC key to close modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeTier = selectedTier || recommendedTier || "medium";
  const pct = Math.round((downloadProgress || 0) * 100);

  function handleEnableToggle() {
    if (!localAIEnabled) {
      setShowPrivacyModal(true);
    } else {
      onDisableLocalAI();
    }
  }

  function handlePrivacyConfirm() {
    setShowPrivacyModal(false);
    onEnableLocalAI();
  }

  function handleSelectCloud() {
    setActiveTab("cloud");
    if (localAIEnabled) {
      onDisableLocalAI();
    }
  }

  function handleSelectLocal() {
    setActiveTab("local");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-backdrop-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-modal-title"
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/80 bg-surface/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-text transition-all animate-modal-pop"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-raised hover:text-text transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent font-bold text-lg">
              ⚡
            </span>
            <h2 id="model-modal-title" className="text-xl font-bold tracking-tight text-text m-0">
              Select AI Engine & Storage Settings
            </h2>
          </div>
          <p className="text-sm text-text-muted m-0 pl-12">
            Configure processing path (Gemini Cloud vs Local WebGPU) and manage on-device chat storage.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/40 bg-bg/80 p-1.5 mb-6">
          <button
            type="button"
            onClick={handleSelectCloud}
            className={`flex items-center justify-center gap-2.5 rounded-lg py-3 px-4 font-semibold text-sm transition-all ${
              activeTab === "cloud"
                ? "bg-surface-raised text-text shadow-md border border-border/40"
                : "text-text-muted hover:text-text hover:bg-surface-raised/40"
            }`}
          >
            <span className="text-lg">☁️</span>
            <div className="text-left">
              <div className="leading-tight">Cloud Mode</div>
              <div className="text-[0.7rem] font-normal text-text-muted">
                {user ? "Gemini 3.1 Flash" : "Requires sign-in"}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleSelectLocal}
            disabled={!localAISupported}
            className={`flex items-center justify-center gap-2.5 rounded-lg py-3 px-4 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              activeTab === "local"
                ? "bg-surface-raised text-text shadow-md border border-border/40"
                : "text-text-muted hover:text-text hover:bg-surface-raised/40"
            }`}
          >
            <span className="text-lg">💻</span>
            <div className="text-left">
              <div className="leading-tight">Local AI Mode</div>
              <div className="text-[0.7rem] font-normal text-text-muted">
                {!localAISupported ? "WebGPU unavailable" : localAIEnabled ? "Active on-device" : "No sign-in required"}
              </div>
            </div>
          </button>
        </div>

        {/* Mode Details Section */}
        {activeTab === "cloud" ? (
          <div className="rounded-xl border border-border/50 bg-bg/40 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <h3 className="text-base font-bold text-text m-0 mb-1">Cloud Gemini Integration</h3>
                <p className="text-sm text-text-muted m-0 leading-relaxed">
                  Cloud mode evaluates safety via a mandatory Crisis Gate before streaming directly with Google Gemini. Your text is never stored in any database or linked to user identity.
                </p>
              </div>
            </div>

            {user ? (
              <div className="flex items-center justify-between rounded-lg bg-accent/10 border border-accent/30 p-3.5">
                <span className="text-sm font-medium text-text">
                  Signed in as <strong className="text-accent">{user.email}</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
                  ✓ Ready
                </span>
              </div>
            ) : (
              <div className="rounded-lg bg-surface-raised border border-border/60 p-4 text-center">
                <p className="text-sm text-text-muted mb-3">
                  Cloud mode requires an account to authorize server requests.
                </p>
                <a
                  href="/login"
                  className="inline-block rounded-lg bg-accent px-5 py-2 text-sm font-bold text-bg hover:bg-accent-strong transition-colors"
                >
                  Log in to enable Cloud
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Toggle Enable Switch */}
            <div className="flex items-center justify-between rounded-xl border border-border/50 bg-bg/40 p-4">
              <div>
                <h3 className="text-sm font-bold text-text m-0">Enable On-Device Local AI</h3>
                <p className="text-xs text-text-muted m-0 mt-0.5">
                  Runs AI models directly inside Web Workers using WebGPU. 0% network output.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={localAIEnabled}
                  onChange={handleEnableToggle}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-surface-raised peer-checked:bg-accent after:absolute after:top-0.5 after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>

            {/* Model Catalog Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-text m-0">Select Model Tier</h3>
                <span className="text-xs text-text-muted">{deviceNote || "Based on WebGPU capability"}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      className={`relative flex flex-col justify-between rounded-xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? "border-accent bg-accent/10 shadow-lg shadow-accent/5"
                          : "border-border/60 bg-surface/70 hover:border-accent/50 hover:bg-surface-raised"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isRecommended && (
                        <span className="absolute top-3 right-3 rounded-full bg-accent/20 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                          Recommended
                        </span>
                      )}
                      <div>
                        <div className="text-base font-bold text-text flex items-center gap-2">
                          {model.label}
                          <span className="text-xs font-semibold text-text-muted">({model.params})</span>
                        </div>
                        <div className="mt-1 text-xs text-text-muted">{model.approxSizeLabel} download</div>
                      </div>
                      <div className="mt-3 pt-2 border-t border-border/20 text-[0.75rem] text-text-muted/80 flex items-center justify-between">
                        <span>Speed: {model.speedLabel || "Balanced"}</span>
                        {isSelected && <span className="font-bold text-accent">Active</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Download Status & Action Bar */}
            <div className="rounded-xl border border-border/50 bg-bg/60 p-4">
              <DownloadStatusSection
                state={downloadState}
                progressPct={pct}
                text={downloadText}
                modelLabel={MODEL_CATALOG[activeTier]?.label}
                localAIStatus={localAIStatus}
                localAIInferring={localAIInferring}
                onStart={() => onStartDownload(activeTier)}
                onResume={() => onStartDownload(activeTier)}
                onCancel={onCancelDownload}
              />
            </div>
          </div>
        )}

        {/* On-Device Storage & Retention Settings Card */}
        <div className="mt-6 rounded-xl border border-border/50 bg-bg/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text m-0 flex items-center gap-2">
              <span>💾</span> On-Device Storage & Lifetime
            </h3>
            <span className="text-xs font-bold text-accent">Always 100% on device</span>
          </div>

          <p className="text-xs text-text-muted m-0 leading-relaxed">
            All chat history is stored locally in your browser and is <strong>never sent to or stored in any database or cloud server</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div
              onClick={() => onSetStorageMode && onSetStorageMode("session")}
              className={`cursor-pointer rounded-xl border-2 p-3 text-xs transition-all ${
                storageMode === "session"
                  ? "border-accent bg-accent/10"
                  : "border-border/60 bg-surface/70 hover:border-accent/40"
              }`}
            >
              <div className="font-bold text-text mb-1 flex items-center justify-between">
                <span>Session Storage (Default)</span>
                {storageMode === "session" && <span className="text-accent font-bold">Active</span>}
              </div>
              <p className="text-[0.75rem] text-text-muted m-0 leading-relaxed">
                Available during your active tab session. Automatically deleted when you close the browser tab.
              </p>
            </div>

            <div
              onClick={() => onSetStorageMode && onSetStorageMode("local")}
              className={`cursor-pointer rounded-xl border-2 p-3 text-xs transition-all ${
                storageMode === "local"
                  ? "border-accent bg-accent/10"
                  : "border-border/60 bg-surface/70 hover:border-accent/40"
              }`}
            >
              <div className="font-bold text-text mb-1 flex items-center justify-between">
                <span>Local Storage (Persistent)</span>
                {storageMode === "local" && <span className="text-accent font-bold">Active</span>}
              </div>
              <p className="text-[0.75rem] text-text-muted m-0 leading-relaxed">
                Saved on this device across browser restarts until manually cleared.
              </p>
            </div>
          </div>

          {onClearAllThreads && (
            <div className="pt-2 flex items-center justify-between border-t border-border/30">
              <span className="text-xs text-text-muted">Want to reset your local conversation state?</span>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="rounded-lg bg-crisis/15 border border-crisis/30 px-3 py-1.5 text-xs font-bold text-crisis hover:bg-crisis hover:text-bg transition-colors"
              >
                Clear all chats
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-bg hover:bg-accent-strong transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      <PrivacyModal
        open={showPrivacyModal}
        onConfirm={handlePrivacyConfirm}
        onCancel={() => setShowPrivacyModal(false)}
      />

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm animate-backdrop-fade"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="w-full max-w-[400px] rounded-2xl border border-border/80 bg-surface p-6 shadow-2xl animate-modal-pop text-text"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold m-0 mb-2">Clear all chats?</h3>
            <p className="text-sm text-text-muted mb-5">
              This will permanently remove all conversation threads stored on this device.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-surface-raised"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearAllThreads();
                }}
                className="rounded-xl bg-crisis px-4 py-2 text-sm font-bold text-bg hover:bg-crisis/90"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadStatusSection({
  state,
  progressPct,
  text,
  modelLabel,
  localAIStatus,
  localAIInferring,
  onStart,
  onResume,
  onCancel,
}) {
  if (state === "ready") {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-accent">
          <span>✓</span> {modelLabel} model is ready on-device.
        </div>
        {localAIInferring && <ThinkingIndicator label="Generating response" />}
      </div>
    );
  }

  if (state === "downloading") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-text">
          <span>Downloading {modelLabel} model...</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between pt-1 text-xs text-text-muted">
          <span>{text || "Fetching model weights..."}</span>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold text-crisis hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state === "error" || state === "cancelled") {
    return (
      <div className="flex items-center justify-between">
        <p className="text-xs text-crisis m-0">
          {state === "cancelled" ? "Download paused." : text || "Download failed."}
        </p>
        <button
          type="button"
          onClick={onResume}
          className="rounded-lg bg-accent/20 px-3.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/30 transition-colors"
        >
          Resume Download
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-bold text-text">Model files needed</div>
        <div className="text-xs text-text-muted">Download {modelLabel} once for offline local usage.</div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-bg hover:bg-accent-strong transition-colors"
      >
        Download {modelLabel}
      </button>
    </div>
  );
}
