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
 *   JSX          -> renders active conversation thread & messages
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

function generateId() {
  return "id-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now();
}

function truncateTitle(text) {
  const trimmed = text.trim();
  if (!trimmed) return "New Conversation";
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

export function useStillpoint() {
  const useLocalAIRef = useRef(false);

  // Threads & active thread state
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [localAISupported, setLocalAISupported] = useState(false);

  // Auth state — fetched once on mount.
  const [user, setUser] = useState(undefined); // undefined = loading
  const [authRequiredOpen, setAuthRequiredOpen] = useState(false);
  const [authRequiredMode, setAuthRequiredMode] = useState("anonymous");

  // Local AI mode state
  const [localAIEnabled, setLocalAIEnabled] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [downloadState, setDownloadState] = useState("idle"); // idle | downloading | ready | error | cancelled
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadText, setDownloadText] = useState("");

  const [localAIStatus, setLocalAIStatus] = useState("idle"); // idle | preparing | downloading | thinking | disposing
  const [localAIInferring, setLocalAIInferring] = useState(false);

  // Crisis region: "us" | "intl" | null. Persisted in localStorage
  const [crisisRegion, setCrisisRegion] = useState(null);

  // Helper to persist threads to localStorage
  const persistThreads = (updatedThreads) => {
    setThreads(updatedThreads);
    try {
      window.localStorage.setItem("stillpoint:threads", JSON.stringify(updatedThreads));
    } catch {
      /* localStorage unavailable */
    }
  };

  // Rehydrate threads from localStorage on mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("stillpoint:threads");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setThreads(parsed);
          setActiveThreadId(parsed[0].id);
        }
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // WebGPU availability check
  useEffect(() => {
    setLocalAISupported(isLocalAISupported());
  }, []);

  // Fetch user session on mount
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

  // Restore persisted crisis-region preference
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("stillpoint:crisisRegion");
      if (saved === "us" || saved === "intl") {
        setCrisisRegion(saved);
      }
    } catch {
      /* localStorage unavailable */
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

  // Thread actions
  const newThread = useCallback(() => {
    setActiveThreadId(null);
    setError("");
    setStatus("");
  }, []);

  const selectThread = useCallback((id) => {
    setActiveThreadId(id);
    setError("");
    setStatus("");
  }, []);

  const deleteThread = useCallback(
    (id) => {
      setThreads((prevThreads) => {
        const updated = prevThreads.filter((t) => t.id !== id);
        try {
          window.localStorage.setItem("stillpoint:threads", JSON.stringify(updated));
        } catch {
          /* best effort */
        }
        if (activeThreadId === id) {
          setActiveThreadId(updated.length > 0 ? updated[0].id : null);
        }
        return updated;
      });
    },
    [activeThreadId]
  );

  const updateThreadTitle = useCallback((id, newTitle) => {
    setThreads((prevThreads) => {
      const updated = prevThreads.map((t) => (t.id === id ? { ...t, title: newTitle } : t));
      try {
        window.localStorage.setItem("stillpoint:threads", JSON.stringify(updated));
      } catch {
        /* best effort */
      }
      return updated;
    });
  }, []);

  // Local AI actions
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
    setLocalAIStatus("disposing");
    unloadLocalAI()
      .catch(() => {})
      .finally(() => {
        setLocalAIStatus("idle");
      });
    setDownloadState("idle");
    setDownloadProgress(0);
    setDownloadText("");
  }, []);

  // Get active thread & messages
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const messages = activeThread ? activeThread.messages : [];

  // Derive legacy single-response states from the last assistant message
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const derivedResponse = lastAssistantMsg ? lastAssistantMsg.text : "";
  const derivedCrisis = !!(lastAssistantMsg && lastAssistantMsg.crisis);
  const derivedCrisisSeverity = lastAssistantMsg?.crisisSeverity || null;
  const derivedLocalAIStopped = !!(lastAssistantMsg?.localAIStopped);

  const submit = useCallback(
    async (rawText) => {
      const trimmed = (rawText || "").trim();
      if (!trimmed) {
        setError("Please enter how you're feeling before submitting.");
        setStatus("");
        return;
      }

      setError("");
      setStatus("");

      // Find or create active thread
      let currentThreadId = activeThreadId;
      let currentThreads = [...threads];

      if (!currentThreadId || !currentThreads.some((t) => t.id === currentThreadId)) {
        currentThreadId = generateId();
        const newThreadObj = {
          id: currentThreadId,
          title: truncateTitle(trimmed),
          createdAt: new Date().toISOString(),
          messages: [],
        };
        currentThreads = [newThreadObj, ...currentThreads];
        setActiveThreadId(currentThreadId);
      }

      const userMsg = {
        id: generateId(),
        role: "user",
        text: trimmed,
        createdAt: new Date().toISOString(),
      };

      // Client-side crisis gate
      const result = parseInput(trimmed);

      if (result.isCrisis) {
        let stopped = false;
        if (useLocalAIRef.current || localAIInferring) {
          abortLocalAIInfight();
          stopped = true;
        }
        setLocalAIInferring(false);
        setLocalAIStatus("idle");

        const assistantCrisisMsg = {
          id: generateId(),
          role: "assistant",
          text: "",
          status: "done",
          crisis: true,
          crisisSeverity: result.severity || "elevated",
          localAIStopped: stopped,
          createdAt: new Date().toISOString(),
        };

        const updatedThreads = currentThreads.map((t) =>
          t.id === currentThreadId
            ? { ...t, messages: [...t.messages, userMsg, assistantCrisisMsg] }
            : t
        );
        persistThreads(updatedThreads);
        return;
      }

      // Non-crisis flow: add user message and pending streaming assistant message
      const assistantMsgId = generateId();
      const initialAssistantMsg = {
        id: assistantMsgId,
        role: "assistant",
        text: "",
        status: "streaming",
        createdAt: new Date().toISOString(),
      };

      const updatedThreadsWithUser = currentThreads.map((t) =>
        t.id === currentThreadId
          ? { ...t, messages: [...t.messages, userMsg, initialAssistantMsg] }
          : t
      );
      persistThreads(updatedThreadsWithUser);

      // Helper to update streaming assistant message text & status
      const updateAssistantMsg = (updateFn) => {
        setThreads((prev) => {
          const nextThreads = prev.map((t) => {
            if (t.id !== currentThreadId) return t;
            const updatedMessages = t.messages.map((m) => {
              if (m.id !== assistantMsgId) return m;
              return updateFn(m);
            });
            return { ...t, messages: updatedMessages };
          });
          try {
            window.localStorage.setItem("stillpoint:threads", JSON.stringify(nextThreads));
          } catch {
            /* best effort */
          }
          return nextThreads;
        });
      };

      if (useLocalAIRef.current) {
        await runLocalAIPipeline(
          trimmed,
          selectedTier,
          setStatus,
          setError,
          setDownloadState,
          setDownloadProgress,
          setDownloadText,
          setLocalAIStatus,
          setLocalAIInferring,
          updateAssistantMsg
        );
        return;
      }

      await runCloudPipeline(
        trimmed,
        setStatus,
        setError,
        setAuthRequiredOpen,
        setAuthRequiredMode,
        user,
        updateAssistantMsg
      );
    },
    [activeThreadId, threads, selectedTier, localAIInferring, user]
  );

  return {
    state: {
      status,
      error,
      crisis: derivedCrisis,
      crisisSeverity: derivedCrisisSeverity,
      response: derivedResponse,
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
      localAIStopped: derivedLocalAIStopped,
      crisisRegion,
      user,
      authRequiredOpen,
      authRequiredMode,
      // Thread state
      threads,
      activeThreadId,
      messages,
    },
    actions: {
      submit,
      enableLocalAI,
      disableLocalAI,
      setSelectedTier,
      startDownload,
      cancelDownload,
      chooseCrisisRegion,
      newThread,
      selectThread,
      deleteThread,
      updateThreadTitle,
      closeAuthRequired: () => {
        setAuthRequiredOpen(false);
        setAuthRequiredMode("anonymous");
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Cloud Pipeline Helper
// ---------------------------------------------------------------------------

async function runCloudPipeline(
  trimmed,
  setStatus,
  setError,
  setAuthRequiredOpen,
  setAuthRequiredMode,
  user,
  updateAssistantMsg
) {
  setStatus("Getting a response…");

  try {
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      setError("");
      setStatus("");
      setAuthRequiredMode(user ? "expired" : "anonymous");
      setAuthRequiredOpen(true);
      // Mark assistant message as done/cancelled
      updateAssistantMsg((msg) => ({ ...msg, status: "done", text: "Sign-in required to use Cloud mode." }));
      return;
    }

    if (!res.ok) {
      const errMsg = data.error || "Something went wrong reaching the cloud. Please try again.";
      setError(errMsg);
      setStatus("");
      updateAssistantMsg((msg) => ({ ...msg, status: "done", text: errMsg }));
      return;
    }

    if (data.isCrisis) {
      updateAssistantMsg((msg) => ({
        ...msg,
        status: "done",
        crisis: true,
        crisisSeverity: data.severity || "elevated",
      }));
      setStatus("");
      return;
    }

    updateAssistantMsg((msg) => ({
      ...msg,
      status: "done",
      text: data.text || "",
    }));
    setStatus("");
  } catch {
    const errMsg = "Network error. Check your connection and try again.";
    setError(errMsg);
    setStatus("");
    updateAssistantMsg((msg) => ({ ...msg, status: "done", text: errMsg }));
  }
}

// ---------------------------------------------------------------------------
// Local AI Pipeline Helper
// ---------------------------------------------------------------------------

async function runLocalAIPipeline(
  trimmed,
  tier,
  setStatus,
  setError,
  setDownloadState,
  setDownloadProgress,
  setDownloadText,
  setLocalAIStatus,
  setLocalAIInferring,
  updateAssistantMsg
) {
  if (!isLocalAISupported()) {
    const errMsg = "Local AI mode isn't supported in this browser. Switch to Cloud in Settings.";
    setError(errMsg);
    updateAssistantMsg((msg) => ({ ...msg, status: "done", text: errMsg }));
    return;
  }

  const gate = parseInput(trimmed);
  if (gate.isCrisis) {
    abortLocalAIInfight();
    setLocalAIInferring(false);
    setLocalAIStatus("idle");
    updateAssistantMsg((msg) => ({
      ...msg,
      status: "done",
      crisis: true,
      crisisSeverity: gate.severity || "elevated",
      localAIStopped: true,
    }));
    setStatus("");
    setError("");
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

    const text = await generateLocal(trimmed, (chunk) => {
      updateAssistantMsg((msg) => ({
        ...msg,
        text: (msg.text || "") + chunk,
      }));
    });

    updateAssistantMsg((msg) => ({
      ...msg,
      status: "done",
      text: msg.text && msg.text.length > 0 ? msg.text : text || "",
    }));
    setStatus("");
  } catch (err) {
    setDownloadState(err?.message === "cancelled" ? "cancelled" : "error");
    const errMsg = err.message || "Local AI mode failed. Switch to Cloud and try again.";
    setError(errMsg);
    updateAssistantMsg((msg) => ({ ...msg, status: "done", text: errMsg }));
    setStatus("");
  } finally {
    setLocalAIStatus("idle");
    setLocalAIInferring(false);
  }
}
