# Stillpoint

*A quiet place to name what you're feeling.*

Stillpoint is a browser-based, accessibility-first tool for putting words to
difficult emotions. It's built around one question: **how little sensitive
information can we send to an AI while still getting a genuinely useful,
supportive response?**

Built for [Hack for Humanity | Summer 2026](https://hack-for-humanity-summer-26.devpost.com/).

**Live app:** [stillpoint-bice.vercel.app](https://stillpoint-bice.vercel.app/)

---

## How it works

Stillpoint has two response paths, and they handle your words differently
on purpose.

**Cloud path** — your typed text is sent to `/api/support` on the server.
First, it passes through the **NOPE Safety API** (`/v1/evaluate`) which acts as a
mandatory Crisis Gate. If a crisis is detected, the API immediately halts AI
processing and surfaces verified crisis resources. If no crisis is found, the
message is passed to Google's Gemini models via the **Vercel AI SDK**
(`streamText`). While the response streams back token-by-token, a parallel
background process uses the free **NOPE Smart Search API** to fetch relevant
mental health resources, and then uses a secondary Gemini structured-output
call to filter and rank those resources based on your exact context. The
ranked resources are appended to the end of the chat stream as interactive
UI cards.

The Gemini API key lives only on the server; messages are never logged or
stored in any database.

**Local AI path** — if you've turned on Local AI mode, your typed text
stays on your device. It is fed directly to an on-device model that runs in
your browser (WebGPU via [WebLLM](https://github.com/mlc-ai/web-llm) when
available, otherwise Transformers.js in a dedicated Web Worker over WASM).
The server is never contacted on this path. Because local generation can be
resource-intensive, we also provide a lightweight static fallback that guides
users on how to manually find resources while keeping their data completely
private.

```
                  ┌──────────────────────────────────┐
                  │    NOPE Safety API Crisis Gate   │
                  └───────────────┬──────────────────┘
                                  │ if not crisis
              ┌───────────────────┴───────────────────┐
              │                                       │
       Local AI path                          Cloud path
              │                                       │
              ▼                                       ▼
     raw text to on-device           raw text → /api/support
     model in browser                → Vercel AI SDK streamText
     (no network call)               → Gemini ranking of NOPE resources
              │                                       │
              ▼                                       ▼
     streamed response                        token stream → UI
     in the UI                                (Cards append at end)
```

The client also runs a lightweight crisis gate first, before either
path is taken. If the gate fires — for language associated with suicidal
ideation or self-harm — Stillpoint **never calls Gemini and never talks
to the local model**. Instead it immediately shows a crisis panel with
immediate-support resources (US: 988, Crisis Text Line, 911; international:
findahelpline.com), what to expect when calling, and a "copy these
resources" button. If a local generation was in flight, it is aborted so
the panel doesn't appear next to a half-finished AI reply. This check
happens in the browser and does not depend on having an API key
configured. The server runs the robust NOPE API gate independently as a
second line of defense.

## Why this design

Stillpoint protects user privacy through ephemeral data retention:
conversation context is kept only in the browser (`sessionStorage` by
default, or `localStorage` if you opt in) and is never persisted to any
database. On the cloud path, messages are decoupled from user identity and
protected by a mandatory Crisis Gate powered by the NOPE API. On the Local
AI path, nothing leaves your device at all.

## Features

- **Multi-turn chat with thread history** — the sidebar lists all
  conversations. Start a new thread, switch between existing ones, or delete
  a thread with the trash icon (a confirmation modal prevents accidents).
- **Dual storage modes** — choose between **Session** (auto-cleared on tab
  close, the default) or **Local** (persisted across browser restarts).
  Switch at any time; the active thread migrates automatically and a toast
  confirms the move.
- **Pauseable AI responses** — a *Pause AI* button appears while any
  response is streaming. Pausing marks the partial reply as
  `(Generation paused)` and keeps the thread intact.
- **Type while generating** — the composer stays editable during a
  response so you can draft your next message; sending is blocked until the
  current response completes.
- **Model picker in the composer bar** — a lightweight popover lets you
  switch between Cloud (Gemini) and any downloaded on-device model tier
  without opening the full settings modal.
- **On-device Local AI with four model tiers**:
  - **Tiny** — SmolLM2-360M-Instruct (~300 MB), fastest to download.
  - **Small** — Qwen2.5-0.5B-Instruct (~400 MB), good for lighter laptops.
  - **Medium** *(default)* — Llama-3.2-1B-Instruct (~880 MB), solid on most laptops.
  - **Large** — Llama-3.2-3B-Instruct (~2.3 GB), best quality; needs a
    capable desktop GPU.

  WebLLM (WebGPU) is used when available, otherwise Transformers.js
  (WASM) runs in a dedicated Web Worker. A progress bar tracks the
  download; generation can be paused or cancelled at any time. The model
  modal also lets you start, cancel, and resume downloads.
- **Speech-to-text (STT)** — a mic button in the composer uses the
  browser Web Speech API. Interim words stream into the textarea as you
  speak; finalized phrases are appended at the cursor.
- **Text-to-speech (TTS)** with two backends:
  - **Browser Web Speech API** — the default, adjustable speed.
  - **Kokoro-82M TTS service** at `services/kokoro/` — a Gradio + FastAPI
    Python service that streams high-quality neural TTS over
    `/v1/tts/stream`. The frontend uses `useStreamingTTS.js` to play
    chunks as they arrive. The service is deployed to Hugging Face
    Spaces automatically by `.github/workflows/services.yaml`; for local
    dev, set `NEXT_PUBLIC_KOKORO_URL` to point at it (defaults to
    `http://localhost:7860`).
- **Crisis gate (NOPE API)** — a robust safety check that evaluates the
  text via NOPE before passing anything to Gemini, intercepting critical
  moments to provide real help.
- **AI-Ranked Resources** — integrated with the free NOPE smart search
  API, the system fetches location-specific support resources, and Gemini
  dynamically ranks and filters them based on the user's specific context.
- **Auth-gated cloud mode** — signing in (or signing up) is required for
  the cloud path. Anonymous users see a non-blocking modal that offers
  Local AI as an alternative. Session expiry is detected and surfaces a
  gentle re-auth prompt.
- **Vercel KV / Redis rate limiting** — the `/api/support` endpoint is
  protected by Upstash/Vercel KV-backed rate limiting to prevent abuse.
- **Toast notifications** — storage migration events and other transient
  messages surface as dismissible toast banners.
- **Logout confirmation modal** — a confirm dialog prevents accidental
  sign-out.
- **Bring your own key (BYOK) not required** — the cloud path uses a
  server-held Gemini key so any signed-in user can use it. Toggle
  **Local AI** in the composer or model modal to keep everything
  on-device.
- **Accessibility-first UI** — set in [Atkinson Hyperlegible
  Next](https://brailleinstitute.org/freefont), a typeface designed by the
  Braille Institute for low-vision readability. High-contrast dark
  palette, large touch targets, full keyboard navigation, visible focus
  states, and `prefers-reduced-motion` support throughout. Uses
  **shadcn/ui** components for accessible resource cards and polished
  interactions.

## Project structure

```
Stillpoint-/
├── src/                          # Next.js 16 (App Router) frontend
│   ├── app/
│   │   ├── layout.jsx            # HTML shell, font, global CSS
│   │   ├── page.jsx              # Landing / marketing page
│   │   ├── globals.css           # Tailwind v4 + @theme design tokens + animations
│   │   ├── privacy/page.jsx      # In-app privacy information page
│   │   ├── login/page.jsx        # Login page
│   │   ├── signup/page.jsx       # Sign-up page
│   │   ├── app/page.jsx          # Main chat workspace (AppPage)
│   │   ├── components/
│   │   │   └── ui/               # shadcn/ui primitives (button.jsx, card.jsx, …)
│   │   └── api/
│   │       ├── support/
│   │       │   ├── route.js      # Cloud path: crisis gate → Gemini streaming
│   │       │   └── _lib/         # Support-path helpers
│   │       │       ├── constants.js
│   │       │       ├── country.js
│   │       │       ├── history.js
│   │       │       ├── resources.js
│   │       │       ├── safety-gate.js
│   │       │       └── schemas.js
│   │       └── auth/
│   │           ├── login/route.js    # JWT-based login
│   │           ├── logout/route.js   # Cookie clear
│   │           ├── me/route.js       # Session check (no rate limit)
│   │           └── signup/route.js   # User registration
│   ├── hooks/
│   │   ├── useSpeechRecognition.js   # Web Speech API STT hook
│   │   ├── useSpeechSynthesis.js     # Browser TTS hook (speed, highlight)
│   │   ├── useStillpoint.js          # Core orchestration: threads, storage,
│   │   │                             # crisis gate, cloud/local pipelines
│   │   └── useStreamingTTS.js        # Streaming TTS client (Kokoro service)
│   ├── lib/
│   │   ├── auth.js                # JWT helpers
│   │   ├── deviceCapability.js    # WebGPU / WASM capability detection
│   │   ├── kokoroVoices.js        # Static voice list for the Kokoro TTS dropdown
│   │   ├── lexicon.js             # Pure data: emotion words, crisis terms
│   │   ├── localai.js             # WebLLM / WASM on-device backend + MODEL_CATALOG
│   │   ├── mongodb.js             # Mongoose connection helper
│   │   ├── nope.js                # NOPE API integration (evaluate + signpost)
│   │   ├── parser.js
│   │   ├── prompt.js              # Shared system prompt unifying model behavior
│   │   ├── rate-limit.js          # Vercel KV / Upstash rate-limit factory
│   │   ├── ttsTokens.js
│   │   ├── utils.js
│   │   └── workers/
│   │       ├── localaiWorker.js   # Web Worker entry for the WASM path
│   │       └── wasmEngine.js      # Hugging Face Transformers engine wrapper
│   └── models/
│       └── User.js                # Mongoose User schema
│
├── services/
│   └── kokoro/                    # Kokoro-82M TTS service (Gradio + FastAPI)
│       ├── app.py                 # Gradio UI entry (also runs uvicorn)
│       ├── auth.py                # Bearer-token check for the streaming API
│       ├── benchmark.py           # Local CPU benchmark script (legacy)
│       ├── quota.py               # ZeroGPU quota tracking
│       ├── requirements.txt
│       ├── stream_api.py          # FastAPI streaming endpoint at /v1/tts/stream
│       ├── tts.py                 # ONNX (primary) + FP32-CL (fallback) pipelines
│       ├── packages.txt           # apt packages for the HF Space
│       └── README.md              # HF Space metadata
│
├── .github/
│   └── workflows/
│       └── services.yaml          # Auto-deploy services/kokoro to HF Space
│
├── public/                        # Static assets served by Next.js
├── .env.example                   # Template for .env.local
├── .env.local                     # Local secrets (gitignored)
├── components.json                # shadcn/ui config
├── jsconfig.json
├── next.config.mjs
├── package.json
├── pnpm-lock.yaml
└── postcss.config.mjs
```

### Where raw text goes

- **Cloud path** — `useStillpoint.js` POSTs raw text + conversation history
  to `src/app/api/support/route.js`. The server's `safety-gate.js` queries
  the NOPE API for a safety check. If safe, `route.js` forwards the
  context to Gemini via the Vercel AI SDK, fetches and ranks resources
  via `resources.js`, and streams the response back as SSE. Raw text is
  held only for the request's duration; never logged, never persisted.
- **Local AI path** — `useStillpoint.js` runs a static fallback or feeds
  the raw text directly to `lib/localai.js`, which runs the model
  on-device via WebLLM or WASM. Nothing leaves the browser on this path.
- **TTS** — the assistant's reply is read aloud either by the browser
  (`useSpeechSynthesis.js`) or, when a Kokoro service URL is configured,
  by `useStreamingTTS.js` posting to the Kokoro `/v1/tts/stream`
  endpoint.

## Getting started

### Frontend (Next.js)

1. Install dependencies: `pnpm install`.
2. Configure environment — copy `.env.example` to `.env.local` and set:
   - `JWT_SECRET` — used for signing/verifying session tokens
     (e.g. `openssl rand -base64 48`).
   - `GEMINI_API_KEY` — held only on the server; never reaches the
     browser. Get one from https://aistudio.google.com/apikey.
   - `MONGODB_URI` — MongoDB connection string for user accounts.
   - `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV) **or**
     `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — for API rate
     limiting on `/api/support`.
   - `NOPE_BASE_URL` / `NOPE_API_KEY` — for the NOPE Safety API (crisis
     evaluation and resource search).
   - `NEXT_PUBLIC_KOKORO_URL` — the Kokoro TTS service URL. Leave empty
     to fall back to the browser's Web Speech API. Local dev default is
     `http://localhost:7860`.
3. Start the dev server: `pnpm dev`, then open `http://localhost:3000`.
4. Sign in (or create an account) from the app. The cloud path requires a
   session; the Local AI path works without one.
5. Write how you're feeling and share it.

### Kokoro TTS service (optional)

The Next.js app will read aloud with the browser's Web Speech API
out-of-the-box. To enable high-quality neural TTS, run the Kokoro service
locally:

```bash
cd services/kokoro
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py        # serves Gradio UI + streaming API on :7860
```

The service has two backends, tried in this order at startup:

1. **ONNX Runtime** (primary) — uses
   `onnx-community/Kokoro-82M-v1.0-ONNX` for the model and downloads
   `voices-v1.0.bin` (~28 MB) from the
   [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)
   GitHub release on first run. Cached under `HF_HUB_CACHE`.
2. **FP32-CL fallback** — pure PyTorch with channels-last memory format
   (~20 % faster than the default). Used only if ONNX init fails.

ZeroGPU is attempted first for each request, and the request falls back
to the CPU pipeline if the quota is exhausted.

## Deployment

- **Frontend** — push to `main`; Vercel builds and deploys the Next.js
  app from the repo root.
- **Kokoro TTS** — `.github/workflows/services.yaml` syncs
  `services/kokoro/` to a Hugging Face Space on every push to `main` that
  touches that path. Configure `HF_USERNAME`, `HF_SPACE_NAME`, and
  `HF_TOKEN` as repository secrets.

## A note on scope

Stillpoint is a support tool, not a replacement for professional mental
health care. If you or someone you know is in crisis in the US:

- **988** — Suicide & Crisis Lifeline (call or text, 24/7)
- **Text "HELLO" to 741741** — Crisis Text Line
- **911** — if there is immediate danger

International resources: [findahelpline.com](https://findahelpline.com)

## License

MIT
