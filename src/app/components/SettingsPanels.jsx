"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODEL_CATALOG, recommendModel } from "@/lib/localai";
import PrivacyModal from "./PrivacyModal";
import ThinkingIndicator from "./ThinkingIndicator";

const TIER_ORDER = ["tiny", "small", "medium", "large"];

/**
 * SettingsPanels — a single, unified "Mode" panel.
 *
 * The user always sees one clear segmented choice up top:
 *   • Cloud (Gemini)  — needs sign-in
 *   • Local AI         — runs in your browser, no sign-in
 *
 * The active mode's controls are expanded inline below the switcher —
 * no nested dialogs, no separate "open the settings drawer" step per
 * mode. Toggling modes is a single click.
 *
 * Why this shape:
 *   - The old design had a single <details> that hid Local AI behind a
 *     disclosure. Cloud had no panel at all. That made mode-switching
 *     feel like a hidden setting instead of a primary choice.
 *   - The auth-error flow now needs a path straight to "switch to
 *     local", so the toggle has to be visible (and clickable) without
 *     opening a disclosure first.
 */
export default function SettingsPanels({
  user,                          // null | { email }
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
  embedded = false,
}) {
  const router = useRouter();
  // The visible "mode" is the source of truth for the UI. We initialize
  // it from props (which mirror the hook's state) and update it locally
  // when the user toggles, then propagate via callbacks. Keeping it
  // here means the segmented control is snappy even if a network call
  // is in flight.
  const [activeMode, setActiveMode] = useState(localAIEnabled ? "local" : "cloud");

  // If the hook flips localAIEnabled from the outside (e.g. from the
  // auth-required modal), reflect it in the segmented control.
  useEffect(() => {
    setActiveMode(localAIEnabled ? "local" : "cloud");
  }, [localAIEnabled]);

  function pickCloud() {
    setActiveMode("cloud");
    // If local AI is currently enabled, turn it off. Free the model.
    if (localAIEnabled) onDisableLocalAI();
  }

  function pickLocal() {
    setActiveMode("local");
    // Don't auto-enable here — the LocalAI panel handles its own
    // privacy modal + download flow. The user clicks the toggle to
    // actually flip it on. This prevents surprise downloads.
  }

  return (
    <section
      aria-labelledby="settings-heading"
      className={embedded ? "p-3 space-y-3" : "mb-7 rounded-[12px] border border-border/30 bg-surface px-5 py-5 sm:px-6 sm:py-6"}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="settings-heading" className="m-0 text-sm font-bold">
          <span aria-hidden="true" className="mr-1.5">⚙️</span>
          Mode
        </h2>
        {localAIEnabled && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.7rem] font-semibold text-accent">
            Local AI
          </span>
        )}
        {!localAIEnabled && (
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[0.7rem] font-semibold text-text-muted">
            Cloud
          </span>
        )}
      </div>

      {/* Segmented control */}
      <div
        role="tablist"
        aria-label="Choose how Stillpoint runs"
        className="mb-4 grid grid-cols-2 gap-1 rounded-[10px] border border-border/20 bg-bg/80 p-1"
      >
        <ModeTab
          active={activeMode === "cloud"}
          onClick={pickCloud}
          icon="☁️"
          title="Cloud"
          subtitle={user ? "Signed in" : "Sign-in needed"}
          requiresAuth={!user}
        />
        <ModeTab
          active={activeMode === "local"}
          onClick={pickLocal}
          icon="💻"
          title="Local AI"
          subtitle={
            !localAISupported
              ? "Not supported"
              : localAIEnabled
                ? "Enabled"
                : "No sign-in"
          }
          disabled={!localAISupported}
        />
      </div>

      {/* Inline panel for whichever mode is active. No more opening
          nested <details> — the controls are right here. */}
      {activeMode === "cloud" ? (
        <CloudModePanel user={user} />
      ) : (
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
      )}
    </section>
  );
}

function ModeTab({ active, onClick, icon, title, subtitle, requiresAuth, disabled }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[3.25rem] flex-col items-start justify-center gap-0.5 rounded-[8px] px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-surface-raised text-text shadow-sm"
          : "text-text-muted hover:bg-surface-raised/50 hover:text-text"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[0.95rem] font-bold leading-tight">
        <span aria-hidden="true">{icon}</span>
        <span>{title}</span>
        {requiresAuth && active && (
          <span aria-hidden="true" className="ml-1 text-[0.7rem] text-text-muted">·</span>
        )}
        {requiresAuth && active && (
          <span className="text-[0.7rem] font-normal text-text-muted">sign in</span>
        )}
      </span>
      <span className="text-[0.8rem] leading-tight text-text-muted">{subtitle}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CloudModePanel — explains the cloud path and offers a single sign-in
// CTA. Replaces the previous "no panel at all" approach.
// ---------------------------------------------------------------------------
function CloudModePanel({ user }) {
  const router = useRouter();

  if (user) {
    return (
      <div className="rounded-[10px] border border-border/60 bg-bg/50 p-4">
        <p className="m-0 mb-1 text-[0.95rem] font-bold text-text">
          Signed in as <span className="text-accent">{user.email}</span>
        </p>
        <p className="m-0 text-[0.9rem] text-text-muted">
          The cloud model uses a server-held Gemini key. Your message passes
          through a crisis gate first, and no conversation history is ever stored in a database.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-border/60 bg-bg/50 p-4">
      <p className="m-0 mb-1 text-[0.95rem] font-bold text-text">
        The cloud model needs a sign-in.
      </p>
      <p className="m-0 mb-4 text-[0.9rem] leading-relaxed text-text-muted">
        We don&apos;t store your messages in any database — but we do need an account so the
        server can authorize the request. Or, you can switch to Local AI
        on the right and skip the sign-in entirely.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="min-h-[2.75rem] rounded-[10px] bg-accent px-4 py-2 text-[0.95rem] font-bold text-bg transition-colors hover:bg-accent-strong"
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="min-h-[2.75rem] rounded-[10px] border-2 border-border bg-transparent px-4 py-2 text-[0.95rem] font-bold text-text transition-colors hover:border-accent hover:text-accent"
        >
          Create a free account
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocalAIPanel — the body of the local-AI mode controls. Mirrors the
// previous standalone panel but lives inline in the unified Mode panel
// instead of being hidden behind a <details>.
// ---------------------------------------------------------------------------
function LocalAIPanel({
  localAISupported,
  enabled,
  selectedTier,
  onSelectTier,
  downloadState,
  downloadProgress,
  downloadText,
  localAIStatus,
  localAIInferring,
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

  if (!localAISupported) {
    return (
      <div className="rounded-[10px] border border-crisis/40 bg-crisis-bg p-4">
        <p className="m-0 text-[0.95rem] font-bold text-text">
          Local AI isn&apos;t available in this browser
        </p>
        <p className="m-0 mt-1 text-[0.9rem] leading-relaxed text-text/85">
          It needs a browser with WebGPU. Cloud mode works in any modern
          browser — just sign in.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="m-0 mb-3 text-[0.9rem] leading-relaxed text-text-muted">
        Local AI runs a small model in this browser tab — nothing is
        sent anywhere, not even the short summary. It downloads a
        one-time model file the first time you turn it on.
      </p>

      <label htmlFor="localAIToggle" className="mb-3 flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          id="localAIToggle"
          name="localAIToggle"
          checked={enabled}
          onChange={handleToggleChange}
          className="h-5 w-5 accent-accent"
        />
        Use Local AI mode
      </label>

      <div className="rounded-[10px] border border-border bg-bg p-4">
        <h3 className="mb-1 text-[1rem] font-bold text-text">Model size</h3>
        <p className="m-0 mb-3 text-[0.85rem] text-text-muted">
          {detecting
            ? "Checking your device to recommend a size…"
            : deviceNote || "Pick a size below."}
        </p>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                className={`rounded-[10px] border-2 px-3 py-2 text-left text-[0.85rem] transition-colors ${
                  isSelected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:border-accent/60"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="block font-bold text-text">
                  {model.label}
                </span>
                <span className="block text-[0.75rem] text-text-muted">
                  {model.approxSizeLabel}
                </span>
                {isRecommended && (
                  <span className="mt-1 inline-block rounded-full bg-accent/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-accent">
                    Recommended
                  </span>
                )}
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
