// localaiWorker.js — dedicated Web Worker that hosts the WASM
// transformers.js pipeline so the main thread doesn't freeze during
// init or inference.
//
// Protocol (see plan in .claude/plans/dreamy-sprouting-kahn-agent-*.md):
//
//   Main -> Worker:
//     { id, type: "init",     payload: { tier, modelId } }
//     { id, type: "generate", payload: { messages, options } }
//     { id, type: "cancel",   payload: {} }
//     { id, type: "dispose",  payload: {} }
//
//   Worker -> Main:
//     { id, type: "progress", payload: { phase, progress?, text?, file? } }
//     { id, type: "ready",    payload: { tier, modelId } }
//     { id, type: "token",    payload: { chunk } }   // streaming
//     { id, type: "result",   payload: { text } }
//     { id, type: "error",    payload: { message, code? } }
//     { id, type: "disposed", payload: {} }

import { WasmEngine } from "./wasmEngine";

const engine = new WasmEngine();

self.addEventListener("message", async (event) => {
  const { id, type, payload } = event.data || {};
  if (typeof id !== "number") return;

  try {
    switch (type) {
      case "init": {
        const { tier, modelId, onProgress } = payload || {};
        await engine.init(tier, modelId, (report) => {
          // Forward every progress event to the main thread.
          self.postMessage({
            id,
            type: "progress",
            payload: report,
          });
        });
        self.postMessage({ id, type: "ready", payload: { tier, modelId } });
        break;
      }

      case "generate": {
        const { messages, options } = payload || {};
        const response = await engine.generate(messages, options, (chunk) => {
          // Stream each decoded word/chunk to the main thread as it
          // arrives, so the UI can render the response token-by-token.
          self.postMessage({ id, type: "token", payload: { chunk } });
        });
        // The transformers.js text-generation pipeline returns an array
        // of conversations; extract the assistant's last message — this
        // is the canonical final text the worker has computed.
        const text = response?.[0]?.generated_text?.at(-1)?.content ?? "";
        self.postMessage({ id, type: "result", payload: { text } });
        break;
      }

      case "cancel": {
        // Cooperative cancel: flag is checked inside the engine's
        // progress callback and at the start of generate().
        engine.cancelled = true;
        // We don't post a response here — the in-flight request will
        // either succeed or throw with code:"cancelled".
        break;
      }

      case "dispose": {
        await engine.dispose();
        self.postMessage({ id, type: "disposed", payload: {} });
        break;
      }

      default:
        self.postMessage({
          id,
          type: "error",
          payload: { message: `Unknown message type: ${type}`, code: "runtime" },
        });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: "error",
      payload: {
        message: err?.message || String(err),
        code: err?.code || "runtime",
      },
    });
  }
});
