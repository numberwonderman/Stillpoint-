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
  generateLocal,
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
  const [localAIReady, setLocalAIReady] = useState(false);

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

  const setLocalAIMode = useCallback((enabled) => {
    useLocalAIRef.current = !!enabled;
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
      await runLocalAI(result, setStatus, setError, setResponse, setLocalAIReady);
      return;
    }

    await runGemini(result, apiKeyRef.current, setStatus, setError, setResponse);
  }, []);

  return {
    state: {
      status,
      error,
      crisis,
      response,
      localAISupported,
      localAIReady,
    },
    actions: {
      submit,
      setApiKey,
      clearApiKey,
      setLocalAIMode,
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
  setStatus,
  setError,
  setResponse,
  setLocalAIReady
) {
  if (!isLocalAISupported()) {
    setError("Local AI mode isn't supported in this browser. Switch to Gemini in Settings.");
    return;
  }

  try {
    if (!isLocalAIReady()) {
      setStatus("Loading on-device model… this only happens once per session.");
      await initLocalAI((progress) => {
        const pct = Math.round((progress.progress || 0) * 100);
        setStatus(`Loading on-device model… ${pct}%`);
      });
      setLocalAIReady(true);
    }

    setStatus("Getting a response…");
    setResponse("");
    const text = await generateLocal(JSON.stringify(result));
    setResponse(text);
    setStatus("");
  } catch (err) {
    setError(err.message || "Local AI mode failed. Switch to Gemini in Settings and try again.");
    setStatus("");
  }
}
