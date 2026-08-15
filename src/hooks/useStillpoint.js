/**
 * useStillpoint — client-side orchestration hook
 *
 * Replaces the imperative body of the old app.js. Wires together:
 *   parser.js   -> turns raw input into a structured summary (or crisis flag)
 *   /api/support -> turns a structured summary into a supportive response
 *                   (cloud, server-held Gemini key, auth-gated)
 *   localai.js  -> turns a structured summary into a supportive response
 *                   (on-device, optional, runs in a Web Worker for the
 *                   WASM path so the main thread stays responsive)
 *   JSX         -> renders whichever state is active via returned `state`
 *
 * Privacy contract:
 *   - Raw user text is handled here only briefly, then handed to parser.js.
 *   - It is never sent to /api/support or localai.js, and never logged.
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
  unloadLocalAI,
} from "@/lib/localai";

export function useStillpoint() {
  // Sensitive session state — refs, not state, so changes don't trigger
  // re-renders and the values stay scoped to this hook instance.
  const useLocalAIRef = useRef(false);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [crisis, setCrisis] = useState(false);
  const [response, setResponse] = useState("");
  const [localAISupported, setLocalAISupported] = useState(false);

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

  // WebGPU availability check is browser-only and never changes for the
  // lifetime of the page, so it's safe to compute once on mount.
  useEffect(() => {
    setLocalAISupported(isLocalAISupported());
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

    // parser.js is the sole consumer of raw text. Nothing downstream
    // ever sees it again.
    const result = parseInput(trimmed);

    if (result.isCrisis) {
      setCrisis(true);
      setStatus("");
      setError("");
      setResponse("");
      return; // Neither /api/support nor Local AI is ever called on this path.
    }

    setCrisis(false);
    setError("");

    if (useLocalAIRef.current) {
      await runLocalAI(
        result,
        selectedTier,
        setStatus,
        setError,
        setResponse,
        setDownloadState,
        setDownloadProgress,
        setDownloadText,
        setLocalAIStatus,
        setLocalAIInferring
      );
      return;
    }

    await runCloud(result, setStatus, setError, setResponse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTier]);

  return {
    state: {
      status,
      error,
      crisis,
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
    },
    actions: {
      submit,
      enableLocalAI,
      disableLocalAI,
      setSelectedTier,
      startDownload,
      cancelDownload,
    },
  };
}

// ---------------------------------------------------------------------------
// Provider branches — small, single-purpose helpers, kept out of the hook
// body so the hook itself stays scannable.
// ---------------------------------------------------------------------------

async function runCloud(result, setStatus, setError, setResponse) {
  setStatus("Getting a response…");
  setResponse("");

  try {
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Only the structured summary crosses the network boundary — no raw
      // user text, no API key (the key lives server-side).
      body: JSON.stringify(result),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setError("Your session has expired. Please sign in again.");
      setStatus("");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Something went wrong reaching the cloud. Please try again.");
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
  result,
  tier,
  setStatus,
  setError,
  setResponse,
  setDownloadState,
  setDownloadProgress,
  setDownloadText,
  setLocalAIStatus,
  setLocalAIInferring
) {
  if (!isLocalAISupported()) {
    setError("Local AI mode isn't supported in this browser. Switch to Cloud in Settings.");
    return;
  }

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
    // Stream each decoded word chunk into the response state as the
    // worker emits it, so the user sees the reply appear word-by-word
    // rather than all at once when the model finishes.
    const text = await generateLocal(JSON.stringify(result), (chunk) => {
      setResponse((prev) => (prev || "") + chunk);
    });
    // The worker also returns a final canonical text; only adopt it
    // if streaming somehow didn't populate anything (e.g. very short
    // outputs that arrive in a single chunk after `result`).
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
