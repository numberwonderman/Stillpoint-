/**
 * useStillpoint — client-side orchestration hook
 *
 * Replaces the imperative body of the old app.js. Wires together:
 *   parser.js   -> turns raw input into a structured summary (or crisis flag)
 *   gemini.js   -> turns a structured summary into a supportive response (cloud)
 *   localai.js  -> turns a structured summary into a supportive response (on-device, optional)
 *   JSX         -> renders whichever state is active via returned `state`
 *
 * Privacy contract is identical to the old app.js:
 *   - Raw user text is handled here only briefly, then handed to parser.js.
 *   - It is never passed to gemini.js, localai.js, or logged anywhere.
 *   - The API key and the local-AI toggle are kept in refs (memory only);
 *     this hook never writes to localStorage / sessionStorage.
 *   - On reload, the in-memory key is gone — that is the intended behavior.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseInput } from "@/lib/parser";
import { getSupportiveResponse } from "@/lib/gemini";
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
  const apiKeyRef = useRef(null);
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

  // WebGPU availability check is browser-only and never changes for the
  // lifetime of the page, so it's safe to compute once on mount.
  useEffect(() => {
    setLocalAISupported(isLocalAISupported());
  }, []);

  // ---- Actions -------------------------------------------------------------

  const setApiKey = useCallback((key) => {
    apiKeyRef.current = (key || "").trim() || null;
  }, []);

  const clearApiKey = useCallback(() => {
    apiKeyRef.current = null;
  }, []);

  const startDownload = useCallback(async (tier) => {
    useLocalAIRef.current = true;
    setDownloadState("downloading");
    setDownloadProgress(0);
    setDownloadText("Starting download…");
    try {
      await initLocalAI(
        (report) => {
          setDownloadProgress(report.progress || 0);
          setDownloadText(report.text || "");
        },
        { tier }
      );
      setDownloadState("ready");
      setDownloadProgress(1);
    } catch (err) {
      if (err && err.message === "cancelled") {
        setDownloadState("cancelled");
      } else {
        setDownloadState("error");
        setDownloadText(err?.message || "Download failed. You can try resuming.");
      }
    }
  }, []);

  const cancelDownload = useCallback(() => {
    cancelLocalAIDownload();
    setDownloadState("cancelled");
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
    unloadLocalAI();
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
      return; // Neither Gemini nor Local AI is ever called on this path.
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
        setDownloadText
      );
      return;
    }

    await runGemini(result, apiKeyRef.current, setStatus, setError, setResponse);
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
    },
    actions: {
      submit,
      setApiKey,
      clearApiKey,
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

async function runGemini(result, apiKey, setStatus, setError, setResponse) {
  if (!apiKey) {
    setError("Add your Gemini API key in Settings before continuing.");
    setStatus("");
    return;
  }

  setStatus("Getting a response…");
  setResponse("");

  try {
    const text = await getSupportiveResponse(result, apiKey);
    setResponse(text);
    setStatus("");
  } catch (err) {
    setError(err.message || "Something went wrong reaching Gemini. Please try again.");
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
  setDownloadText
) {
  if (!isLocalAISupported()) {
    setError("Local AI mode isn't supported in this browser. Switch to Gemini in Settings.");
    return;
  }

  try {
    if (!isLocalAIReady() || getReadyModelKey() !== tier) {
      setStatus("Loading on-device model… this only happens once per session.");
      setDownloadState("downloading");
      await initLocalAI(
        (report) => {
          const pct = Math.round((report.progress || 0) * 100);
          setDownloadProgress(report.progress || 0);
          setDownloadText(report.text || "");
          setStatus(`Loading on-device model… ${pct}%`);
        },
        { tier }
      );
      setDownloadState("ready");
      setDownloadProgress(1);
    }

    setStatus("Getting a response…");
    setResponse("");
    const text = await generateLocal(JSON.stringify(result));
    setResponse(text);
    setStatus("");
  } catch (err) {
    setDownloadState(err?.message === "cancelled" ? "cancelled" : "error");
    setError(err.message || "Local AI mode failed. Switch to Gemini in Settings and try again.");
    setStatus("");
  }
}
