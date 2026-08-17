/**
 * useStillpoint — client-side orchestration hook
 *
 * Replaces the imperative body of the old app.js. Wires together:
 *   /api/support -> cloud path. The server receives raw text, runs
 *                   parser.js, and forwards a structured summary to
 *                   Gemini (auth-gated; key lives on the server).
 *   localai.js   -> on-device path. Raw text is fed directly to the
 *                   local model in the browser/Web Worker; the server
 *                   is not involved at all.
 *   client-side  -> the crisis gate runs here on the raw text before
 *                   either branch is taken, so a person who needs
 *                   immediate help gets the local resources even if
 *                   they aren't signed in or the network is down.
 *   JSX          -> renders whichever state is active via returned `state`
 *
 * Privacy contract:
 *   - Cloud path: raw text is sent to /api/support. The server holds it
 *     only for the duration of that request, never logs or persists it,
 *     and forwards only the structured summary to Gemini.
 *   - Local-AI path: raw text never leaves the device.
 *   - The Gemini API key is held only on the server; the client never sees
 *     it. /api/support authenticates the request with the httpOnly session
 *     cookie set by /api/auth/login or /api/auth/signup.
 *   - The local-AI toggle is kept in a ref (memory only).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseInput } from "@/lib/parser";
import {
  isLocalAISupported,
  initLocalAI,
  isLocalAIReady,
  getReadyModelKey,
  generateLocal,
  cancelLocalAIDownload,
  abortLocalAIInfight,
  unloadLocalAI,
} from "@/lib/localai";

export function useStillpoint() {
  // Sensitive session state — refs, not state, so changes don't trigger
  // re-renders and the values stay scoped to this hook instance.
  const useLocalAIRef = useRef(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [crisis, setCrisis] = useState(false);
  // Severity of the most recent crisis trigger: "elevated" | "high" |
  // "imminent". Drives the panel's tone and which resources it surfaces.
  const [crisisSeverity, setCrisisSeverity] = useState(null);
  const [response, setResponse] = useState("");
  const [localAISupported, setLocalAISupported] = useState(false);

  // Auth state — fetched once on mount. null = signed out, { email } =
  // signed in. The auth-required modal uses this to decide its headline.
  const [user, setUser] = useState(undefined); // undefined = loading
  // Becomes true the moment the cloud path returns 401, so the
  // AuthRequiredModal can appear with a clear, two-button choice.
  const [authRequiredOpen, setAuthRequiredOpen] = useState(false);
  // "anonymous" — user never signed in this session, the cloud path
  //   just rejected the request because there's no account.
  // "expired"   — we *were* signed in earlier (user !== null at the
  //   moment of the 401) and the cookie / token has now gone stale.
  // The modal swaps its headline + body between the two so the
  // language never says "session expired" to someone who never had one.
  const [authRequiredMode, setAuthRequiredMode] = useState("anonymous");

  // Local AI mode state (separate from the "ready" flag on the module —
  // this drives the settings-panel UI).
  const [localAIEnabled, setLocalAIEnabled] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [downloadState, setDownloadState] = useState("idle"); // idle | downloading | ready | error | cancelled
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadText, setDownloadText] = useState("");

  // Granular lifecycle states for the WASM path. Surfaces "preparing"
  // and "thinking" so the user can see the worker is alive even after
  // the progress bar has stopped moving.
  const [localAIStatus, setLocalAIStatus] = useState("idle"); // idle | preparing | downloading | thinking | disposing
  const [localAIInferring, setLocalAIInferring] = useState(false);
  // Set true when the crisis gate aborts an in-flight local-AI generation,
  // so the crisis panel can tell the user the on-device response was
  // stopped. Cleared the next time they submit non-crisis text.
  const [localAIStopped, setLocalAIStopped] = useState(false);

  // Crisis region: "us" | "intl" | null. Persisted in localStorage so
  // the user doesn't have to re-pick each time. `null` means "haven't
  // asked yet" and the panel will prompt on first render.
  const [crisisRegion, setCrisisRegion] = useState(null);

  // WebGPU availability check is browser-only and never changes for the
  // lifetime of the page, so it's safe to compute once on mount.
  useEffect(() => {
    setLocalAISupported(isLocalAISupported());
  }, []);

  // Fetch the current user once on mount. If they came back from a
  // /login or /signup redirect, this picks up the new session. The
  // auth-required modal reads `user` to choose its copy.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore persisted crisis-region preference (so the user doesn't have
  // to re-pick each time the crisis panel shows).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("stillpoint:crisisRegion");
      if (saved === "us" || saved === "intl") {
        setCrisisRegion(saved);
      }
    } catch {
      /* localStorage unavailable (private mode, etc.) — fall back to ask */
    }
  }, []);

  const chooseCrisisRegion = useCallback((region) => {
    setCrisisRegion(region);
    try {
      window.localStorage.setItem("stillpoint:crisisRegion", region);
    } catch {
      /* best-effort persistence */
    }
  }, []);

  // ---- Actions -------------------------------------------------------------

  const startDownload = useCallback(async (tier) => {
    useLocalAIRef.current = true;
    setDownloadState("downloading");
    setDownloadProgress(0);
    setDownloadText("Starting download…");
    setLocalAIStatus("preparing");
    try {
      await initLocalAI(
        (report) => {
          setDownloadProgress(report.progress || 0);
          setDownloadText(report.text || "");
          // Once we see real progress the worker is past the "preparing"
          // phase and is actively downloading / loading weights.
          if (report.progress && report.progress > 0) {
            setLocalAIStatus("downloading");
          }
        },
        { tier }
      );
      setDownloadState("ready");
      setDownloadProgress(1);
      setLocalAIStatus("idle");
    } catch (err) {
      if (err && err.message === "cancelled") {
        setDownloadState("cancelled");
      } else {
        setDownloadState("error");
        setDownloadText(err?.message || "Download failed. You can try resuming.");
      }
      setLocalAIStatus("idle");
    }
  }, []);

  const cancelDownload = useCallback(() => {
    cancelLocalAIDownload();
    setDownloadState("cancelled");
    setLocalAIStatus("idle");
  }, []);

  const enableLocalAI = useCallback(() => {
    useLocalAIRef.current = true;
    setLocalAIEnabled(true);
  }, []);

  const disableLocalAI = useCallback(() => {
    useLocalAIRef.current = false;
    setLocalAIEnabled(false);
    // Free the in-memory model weights once the person opts back into
    // cloud mode — no reason to keep them resident.
    setLocalAIStatus("disposing");
    unloadLocalAI()
      .catch(() => {
        /* best-effort dispose; the worker is torn down regardless */
      })
      .finally(() => {
        setLocalAIStatus("idle");
      });
    setDownloadState("idle");
    setDownloadProgress(0);
    setDownloadText("");
  }, []);

  const submit = useCallback(async (rawText) => {
    const trimmed = (rawText || "").trim();
    if (!trimmed) {
      setError("Please enter how you're feeling before submitting.");
      setStatus("");
      setResponse("");
      setCrisis(false);
      return;
    }

    // Client-side crisis gate. Runs on the raw text before either branch
    // is taken, so a person who needs immediate help gets local resources
    // even if they aren't signed in or the network is down. The server
    // runs the same gate independently on its side as a second line of
    // defense — both must agree.
    const result = parseInput(trimmed);

    if (result.isCrisis) {
      // HARD STOP. If a local-AI generation is in flight (e.g. the user
      // submitted a follow-up that turned out to be crisis text), abort
      // it now so the streaming response doesn't remain visible while
      // the crisis panel is shown.
      if (useLocalAIRef.current || localAIInferring) {
        abortLocalAIInfight();
        setLocalAIStopped(true);
      }
      setLocalAIInferring(false);
      setLocalAIStatus("idle");
      setCrisis(true);
      // Carry the parser's severity through to the panel so it can adapt
      // its tone and resource ordering. Default to "elevated" if the
      // server or older client somehow returns a bare crisis signal.
      setCrisisSeverity(result.severity || "elevated");
      setStatus("");
      setError("");
      setResponse("");
      return; // Neither /api/support nor Local AI is ever called on this path.
    }

    // Non-crisis path clears the "we stopped the model" flag so the next
    // crisis event starts fresh.
    setLocalAIStopped(false);
    setCrisis(false);
    setCrisisSeverity(null);
    setError("");

    if (useLocalAIRef.current) {
      await runLocalAI(
        trimmed,
        selectedTier,
        setStatus,
        setError,
        setResponse,
        setDownloadState,
        setDownloadProgress,
        setDownloadText,
        setLocalAIStatus,
        setLocalAIInferring,
        setCrisis,
        setLocalAIStopped
      );
      return;
    }

    await runCloud(trimmed, setStatus, setError, setResponse, setCrisis, setCrisisSeverity, setAuthRequiredOpen, setAuthRequiredMode, user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTier, localAIInferring]);

  return {
    state: {
      status,
      error,
      crisis,
      crisisSeverity,
      response,
      localAISupported,
      localAIEnabled,
      localAIReady: isLocalAIReady(),
      readyModelKey: getReadyModelKey(),
      selectedTier,
      downloadState,
      downloadProgress,
      downloadText,
      localAIStatus,
      localAIInferring,
      localAIStopped,
      crisisRegion,
      user,
      authRequiredOpen,
      authRequiredMode,
    },
    actions: {
      submit,
      enableLocalAI,
      disableLocalAI,
      setSelectedTier,
      startDownload,
      cancelDownload,
      chooseCrisisRegion,
      closeAuthRequired: () => {
        setAuthRequiredOpen(false);
        // Reset the mode so the next 401 re-derives it from `user`
        // rather than reusing the previous one. Cheap and keeps the
        // state machine predictable.
        setAuthRequiredMode("anonymous");
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Provider branches — small, single-purpose helpers, kept out of the hook
// body so the hook itself stays scannable.
// ---------------------------------------------------------------------------

async function runCloud(trimmed, setStatus, setError, setResponse, setCrisis, setCrisisSeverity, setAuthRequiredOpen, setAuthRequiredMode, user) {
  setStatus("Getting a response…");
  setResponse("");

  try {
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Raw text crosses the network to /api/support so the server can
      // run parser.js. The server is the only thing that calls parser.js
      // for the cloud path — the client never pre-processes for Gemini.
      // The API key lives only on the server (httpOnly cookie auth).
      body: JSON.stringify({ text: trimmed }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      // Don't dump a generic "session expired" string — open the
      // AuthRequiredModal so the user can either sign in or switch
      // to Local AI in one click. The modal's headline reflects whether
      // they were previously signed in (expired) or never signed in
      // (anonymous). `user` is captured at the moment of the 401 so a
      // race between /api/auth/me and /api/support can't flip the tone.
      setError("");
      setStatus("");
      setAuthRequiredMode(user ? "expired" : "anonymous");
      setAuthRequiredOpen(true);
      return;
    }
    if (!res.ok) {
      setError(data.error || "Something went wrong reaching the cloud. Please try again.");
      setStatus("");
      return;
    }
    if (data.isCrisis) {
      setCrisis(true);
      setCrisisSeverity(data.severity || "elevated");
      setStatus("");
      return;
    }

    setResponse(data.text || "");
    setStatus("");
  } catch {
    setError("Network error. Check your connection and try again.");
    setStatus("");
  }
}

async function runLocalAI(
  trimmed,
  tier,
  setStatus,
  setError,
  setResponse,
  setDownloadState,
  setDownloadProgress,
  setDownloadText,
  setLocalAIStatus,
  setLocalAIInferring,
  setCrisis,
  setLocalAIStopped
) {
  if (!isLocalAISupported()) {
    setError("Local AI mode isn't supported in this browser. Switch to Cloud in Settings.");
    return;
  }

  // Defense-in-depth: re-run the crisis gate immediately before handing
  // raw text to the on-device model. submit() already checked, but if
  // runLocalAI is ever invoked from anywhere else (or if a future refactor
  // changes the call site), this hard stop keeps the local model from
  // ever seeing crisis text.
  const gate = parseInput(trimmed);
  if (gate.isCrisis) {
    abortLocalAIInfight();
    setLocalAIStopped(true);
    setLocalAIInferring(false);
    setLocalAIStatus("idle");
    setCrisis(true);
    setCrisisSeverity(gate.severity || "elevated");
    setStatus("");
    setError("");
    setResponse("");
    return;
  }
  // Defense-in-depth path also clears the flag if it had been left set
  // from a previous crisis event but the new input is non-crisis.
  setLocalAIStopped(false);

  try {
    if (!isLocalAIReady() || getReadyModelKey() !== tier) {
      setLocalAIStatus("preparing");
      setStatus("Initializing on-device model in a background worker…");
      setDownloadState("downloading");
      await initLocalAI(
        (report) => {
          const pct = Math.round((report.progress || 0) * 100);
          setDownloadProgress(report.progress || 0);
          setDownloadText(report.text || "");
          if (report.progress && report.progress > 0) {
            setLocalAIStatus("downloading");
            setStatus(`Loading on-device model… ${pct}%`);
          }
        },
        { tier }
      );
      setDownloadState("ready");
      setDownloadProgress(1);
      setLocalAIStatus("idle");
    }

    setLocalAIStatus("thinking");
    setLocalAIInferring(true);
    setStatus("Thinking on-device…");
    setResponse("");
    // Raw text is fed directly to the on-device model. Nothing leaves
    // the browser on this path — the server is not involved at all.
    // Stream each decoded word chunk into the response state as the
    // worker emits it, so the user sees the reply appear word-by-word
    // rather than all at once when the model finishes.
    const text = await generateLocal(trimmed, (chunk) => {
      setResponse((prev) => (prev || "") + chunk);
    });
    // The worker also returns a final canonical text; only adopt it
    // if streaming somehow didn't populate anything (e.g. very short
    // outputs that arrive in a single chunk after `text`).
    setResponse((prev) => (prev && prev.length > 0 ? prev : text || ""));
    setStatus("");
  } catch (err) {
    setDownloadState(err?.message === "cancelled" ? "cancelled" : "error");
    setError(err.message || "Local AI mode failed. Switch to Cloud and try again.");
    setStatus("");
  } finally {
    setLocalAIStatus("idle");
    setLocalAIInferring(false);
  }
}
