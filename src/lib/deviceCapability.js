/**
 * deviceCapability.js — Stillpoint
 *
 * Best-effort, privacy-respecting device capability detection used only to
 * decide which on-device model tier to download for Local AI mode. Nothing
 * gathered here is sent anywhere — it's read entirely client-side and used
 * once, locally, to pick a model.
 *
 * We deliberately keep this heuristic rather than exact: the browser does
 * not expose real free VRAM/RAM to JS, so we combine several weak signals
 * (deviceMemory, logical cores, mobile UA, WebGPU adapter limits) into a
 * rough capability score and map that to a model tier.
 */

// Tiers, ordered smallest -> largest. `score` is the minimum capability
// score required to select this tier (see scoreDevice()).
export const TIERS = {
  tiny: { order: 0, label: "Tiny", minScore: 0 },
  small: { order: 1, label: "Small", minScore: 2 },
  medium: { order: 2, label: "Medium", minScore: 4 },
  large: { order: 3, label: "Large", minScore: 6 },
};

/**
 * Returns true if this looks like a phone/tablet rather than a desktop or
 * laptop. Best-effort — UA sniffing is inherently imperfect.
 */
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;

  // Modern, more reliable signal where available.
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }

  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}

/**
 * Gathers the raw signals the browser is willing to expose. Every field is
 * optional/undefined in browsers that don't support the relevant API
 * (notably Safari and Firefox lack navigator.deviceMemory entirely).
 */
export async function readDeviceSignals() {
  const signals = {
    deviceMemoryGB: undefined, // Chrome/Edge only; values like 0.25–8 (capped at 8)
    logicalCores: undefined,
    isMobile: isMobileDevice(),
    hasWebGPU: false,
    gpuMaxBufferSizeMB: undefined,
  };

  if (typeof navigator === "undefined") return signals;

  if (typeof navigator.deviceMemory === "number") {
    signals.deviceMemoryGB = navigator.deviceMemory;
  }
  if (typeof navigator.hardwareConcurrency === "number") {
    signals.logicalCores = navigator.hardwareConcurrency;
  }

  if (navigator.gpu) {
    signals.hasWebGPU = true;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      const maxBufferSize = adapter?.limits?.maxBufferSize;
      if (typeof maxBufferSize === "number") {
        signals.gpuMaxBufferSizeMB = Math.round(maxBufferSize / (1024 * 1024));
      }
    } catch {
      // Adapter probing is best-effort only; a failure here just means we
      // fall back to the non-GPU signals below.
    }
  }

  return signals;
}

/**
 * Turns raw signals into a rough 0–7 capability score. Thresholds are
 * intentionally conservative (favor a smaller, faster download when
 * unsure) since a failed/very slow download is a worse experience than a
 * slightly smaller model.
 */
export function scoreDevice(signals) {
  let score = 2; // assume "small-ish" by default when signals are unavailable

  if (typeof signals.deviceMemoryGB === "number") {
    if (signals.deviceMemoryGB >= 8) score = 6;
    else if (signals.deviceMemoryGB >= 4) score = 4;
    else if (signals.deviceMemoryGB >= 2) score = 2;
    else score = 0;
  }

  if (typeof signals.logicalCores === "number") {
    if (signals.logicalCores >= 8) score += 1;
    else if (signals.logicalCores <= 2) score -= 1;
  }

  if (typeof signals.gpuMaxBufferSizeMB === "number") {
    // 2GB+ single-buffer support is a decent proxy for a real discrete/
    // integrated GPU rather than a constrained mobile one.
    if (signals.gpuMaxBufferSizeMB >= 2048) score += 1;
    else if (signals.gpuMaxBufferSizeMB < 512) score -= 1;
  }

  if (signals.isMobile) score -= 2;
  if (!signals.hasWebGPU) score -= 3; // shouldn't reach model selection, but be safe

  return Math.max(0, Math.min(7, score));
}

/**
 * Full pipeline: read signals, score them, map to a tier name.
 * @returns {Promise<{tier: keyof typeof TIERS, score: number, signals: object}>}
 */
export async function detectDeviceTier() {
  const signals = await readDeviceSignals();
  const score = scoreDevice(signals);

  let tier = "tiny";
  for (const [name, def] of Object.entries(TIERS)) {
    if (score >= def.minScore) tier = name;
  }

  return { tier, score, signals };
}
