/**
 * app.js — Stillpoint
 *
 * Orchestration only. Wires together:
 *   parser.js  -> turns raw input into a structured summary (or crisis flag)
 *   gemini.js  -> turns a structured summary into a supportive response (cloud)
 *   localai.js -> turns a structured summary into a supportive response (on-device, optional)
 *   index.html -> renders whichever state is active
 *
 * app.js is the ONLY place that decides which branch to take. Raw user
 * text lives here only briefly — it is handed to parser.js and then
 * discarded; it must never be passed to gemini.js, localai.js, or logged
 * anywhere. Only the structured summary produced by parser.js ever leaves
 * this module.
 */

import { parseInput } from "./parser.js";
import { getSupportiveResponse } from "./gemini.js";
import {
  isLocalAISupported,
  initLocalAI,
  isLocalAIReady,
  generateLocal,
} from "./localai.js";

// ---------------------------------------------------------------------------
// Local, hardcoded crisis resources — rendered WITHOUT calling Gemini or
// Local AI.
// Keep this list short, accurate, and easy to scan under distress.
// ---------------------------------------------------------------------------
const CRISIS_RESOURCES_HTML = `
  <div class="crisis-panel" role="alert">
    <h2>You're not alone right now</h2>
    <p>What you're feeling matters, and immediate support is available:</p>
    <ul>
      <li><strong>988</strong> — Suicide &amp; Crisis Lifeline (call or text, 24/7)</li>
      <li><strong>Text "HELLO" to 741741</strong> — Crisis Text Line</li>
      <li><strong>911</strong> — if you are in immediate danger</li>
    </ul>
    <p>If you're able to, please reach out to one of these right now.</p>
  </div>
`;

// ---------------------------------------------------------------------------
// Session state (in memory only — never persisted)
// ---------------------------------------------------------------------------
const sessionState = {
  apiKey: null,
  useLocalAI: false, // toggled from Settings; defaults to Gemini (cloud)
};

// ---------------------------------------------------------------------------
// Entry point wired to the UI's submit action (see index.html)
// ---------------------------------------------------------------------------
export async function handleUserSubmit(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) {
    renderError("Please enter how you're feeling before submitting.");
    return;
  }

  // parser.js is the sole consumer of raw text. Nothing downstream ever
  // sees it again.
  const result = parseInput(trimmed);

  if (result.isCrisis) {
    renderCrisis();
    return; // Neither Gemini nor Local AI is ever called on this path.
  }

  if (sessionState.useLocalAI) {
    await handleLocalAIPath(result);
    return;
  }

  await handleGeminiPath(result);
}

async function handleGeminiPath(result) {
  if (!sessionState.apiKey) {
    renderError("Add your Gemini API key in Settings before continuing.");
    return;
  }

  renderLoading("Getting a response…");

  try {
    const responseText = await getSupportiveResponse(result, sessionState.apiKey);
    renderSupportiveResponse(responseText);
  } catch (err) {
    renderError(err.message || "Something went wrong reaching Gemini. Please try again.");
  }
}

async function handleLocalAIPath(result) {
  if (!isLocalAISupported()) {
    renderError("Local AI mode isn't supported in this browser. Switch to Gemini in Settings.");
    return;
  }

  try {
    if (!isLocalAIReady()) {
      renderLoading("Loading on-device model… this only happens once per session.");
      await initLocalAI((progress) => {
        const pct = Math.round((progress.progress || 0) * 100);
        renderLoading(`Loading on-device model… ${pct}%`);
      });
    }

    renderLoading("Getting a response…");
    const responseText = await generateLocal(JSON.stringify(result));
    renderSupportiveResponse(responseText);
  } catch (err) {
    renderError(err.message || "Local AI mode failed. Switch to Gemini in Settings and try again.");
  }
}

// ---------------------------------------------------------------------------
// Settings — called from the settings panel UI
// ---------------------------------------------------------------------------
export function setApiKey(key) {
  sessionState.apiKey = (key || "").trim() || null;
}

export function clearApiKey() {
  sessionState.apiKey = null;
}

export function setLocalAIMode(enabled) {
  sessionState.useLocalAI = !!enabled;
}

export function isLocalAIModeOn() {
  return sessionState.useLocalAI;
}

// ---------------------------------------------------------------------------
// Render helpers
// All of these assume simple DOM containers exist in index.html:
//   #output, #status
// Swap these out for framework-specific rendering later if needed —
// kept plain here so the flow stays easy to trace.
// ---------------------------------------------------------------------------

function renderCrisis() {
  const output = document.getElementById("output");
  if (output) output.innerHTML = CRISIS_RESOURCES_HTML;
  setStatus("");
}

function renderLoading(message) {
  setStatus(message);
}

function renderSupportiveResponse(text) {
  const output = document.getElementById("output");
  if (output) {
    const p = document.createElement("p");
    p.className = "supportive-response";
    p.textContent = text;
    output.innerHTML = "";
    output.appendChild(p);
  }
  setStatus("");
}

function renderError(message) {
  setStatus(message, true);
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message;
  status.className = isError ? "status error" : "status";
}
