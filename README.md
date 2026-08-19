# Stillpoint

*A quiet place to name what you're feeling.*

Stillpoint is a browser-based, accessibility-first tool for putting words to
difficult emotions. It's built around one question: **how little sensitive
information can we send to an AI while still getting a genuinely useful,
supportive response?**

Built for [Hack for Humanity | Summer 2026](https://hack-for-humanity-summer-26.devpost.com/).

---

## How it works

Stillpoint has two response paths, and they handle your words differently
on purpose.

**Cloud path** — your typed text is sent to `/api/support` on the server.
First, it passes through the **NOPE Safety API** (`/v1/evaluate`) which acts as a mandatory Crisis Gate. If a crisis is detected, the API immediately halts AI processing and surfaces verified crisis resources.
If no crisis is found, the message is passed to Google's Gemini models via the **Vercel AI SDK** (`streamText`). While the response streams back token-by-token, a parallel background process uses the free **NOPE Smart Search API** to fetch relevant mental health resources, and then uses a secondary Gemini structured output call to filter and rank those resources based on your exact context. The ranked resources are appended to the end of the chat stream as interactive UI cards.

The Gemini API key lives only on the server; messages are never logged or stored in any database.

**Local AI path** — if you've turned on Local AI mode, your typed text
stays on your device. It is fed directly to an on-device model that runs in
your browser (WebGPU when available, otherwise WebAssembly in a Web Worker).
The server is never contacted on this path. Because local generation can be resource-intensive, we also provide a lightweight static fallback that guides users on how to manually find resources while keeping their data completely private.

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
immediate-support resources (US: 988, Crisis Text Line, 911; international: findahelpline.com), what
to expect when calling, and a "copy these resources" button. If a local
generation was in flight, it is aborted so the panel doesn't appear next
to a half-finished AI reply. This check happens in the browser and does
not depend on having an API key configured. The server runs the robust NOPE API gate independently
as a second line of defense.

## Why this design

Stillpoint protects user privacy through ephemeral data retention: conversation
context is kept only in the browser (`sessionStorage` by default, or
`localStorage` if you opt in) and is never persisted to any database. On the
cloud path, messages are decoupled from user identity and protected by a
mandatory Crisis Gate powered by the NOPE API. On the Local AI path, nothing leaves your device at all.

> **See how StillPoint compares to generic AI assistants:** Check out our [Comparison Dataset](docs/comparison_dataset.md) to understand why our "listening over solving" architecture outperforms generic solutions.

## Features

- **Multi-turn chat with thread history** — the sidebar lists all conversations.
  Start a new thread, switch between existing ones, or delete a thread with the
  trash icon (a confirmation modal prevents accidents).
- **Dual storage modes** — choose between **Session** (auto-cleared on tab close,
  the default) or **Local** (persisted across browser restarts). Switch at any
  time; the active thread migrates automatically and a toast confirms the move.
- **Pauseable AI responses** — a *Pause AI* button appears while any response is
  streaming. Pausing marks the partial reply as `(Generation paused)` and keeps
  the thread intact.
- **Type while generating** — the composer stays editable during a response so
  you can draft your next message; sending is blocked until the current response
  completes.
- **Model picker in the composer bar** — a lightweight popover lets you switch
  between Cloud (Gemini) and any downloaded on-device model tier without opening
  the full settings modal.
- **On-device Local AI with tiered models** — three model sizes (small / medium /
  large) backed by WebLLM (WebGPU) or Hugging Face Transformers (WASM). A
  progress bar tracks the download; generation can be paused or cancelled at any
  time. The model modal also lets you start, cancel, and resume downloads.
- **Speech-to-text (STT)** — a mic button in the composer uses the browser
  Web Speech API. Interim words stream into the textarea as you speak;
  finalized phrases are appended at the cursor.
- **Text-to-speech (TTS)** — assistant messages can be read aloud via the browser
  speech synthesis API, with adjustable speed settings.
- **Crisis gate (NOPE API)** — a robust safety check that evaluates the text via NOPE before passing anything to Gemini, intercepting critical moments to provide real help.
- **AI-Ranked Resources** — integrated with the free NOPE smart search API, the system fetches location-specific support resources, and Gemini dynamically ranks and filters them based on the user's specific context.
- **Auth-gated cloud mode** — signing in (or signing up) is required for the
  cloud path. Anonymous users see a non-blocking modal that offers Local AI as
  an alternative. Session expiry is detected and surfaces a gentle re-auth
  prompt.
- **Redis rate limiting** — the `/api/support` endpoint is protected by
  Upstash Redis-backed rate limiting to prevent abuse.
- **Toast notifications** — storage migration events and other transient
  messages surface as dismissible toast banners.
- **Logout confirmation modal** — a confirm dialog prevents accidental sign-out.
- **Bring your own key (BYOK) not required** — the cloud path uses a server-held
  Gemini key so any signed-in user can use it. Toggle **Local AI** in the
  composer or model modal to keep everything on-device.
- **Accessibility-first UI** — set in [Atkinson Hyperlegible
  Next](https://brailleinstitute.org/freefont), a typeface designed by the
  Braille Institute for low-vision readability. High-contrast dark palette,
  large touch targets, full keyboard navigation, visible focus states, and
  `prefers-reduced-motion` support throughout. Integrates **shadcn/ui** components for accessible resource cards and polished interactions.

## Project structure

```
src/
  app/
    layout.jsx                 HTML shell, font, global CSS
    page.jsx                   Landing / marketing page
    globals.css                Tailwind v4 + @theme design tokens + animations
    app/
      page.jsx                 Main chat workspace (AppPage)
    components/
      AuthForm.jsx             Shared sign-in / sign-up form
      AuthRequiredModal.jsx    Non-blocking auth gate modal
      ChatShell.jsx            Responsive layout: sidebar rail + main area
      ClearAllConfirmModal.jsx Confirmation dialog for clearing all threads
      Composer.jsx             Auto-growing textarea, STT mic, model picker, send/pause
      DeleteThreadConfirmModal.jsx Confirmation dialog for single thread deletion
      LocalAIPanel.jsx         Simplified local AI status/progress panel
      LogoutConfirmModal.jsx   Confirmation dialog for sign-out
      MessageBubble.jsx        Single chat bubble (user / assistant / crisis)
      MessageList.jsx          Scrollable message stream, empty state, loading badge
      ModelSelectionModal.jsx  Full-screen model settings modal (tiers, storage, download)
      NavBar.jsx               Top navigation (landing pages)
      PrivacyModal.jsx         Privacy information overlay
      ResponseSection.jsx      Legacy live-region component (kept for compatibility)
      SettingsPanels.jsx       Local AI toggle settings panel
      Sidebar.jsx              Collapsible left sidebar with thread list, storage toggle, account controls
      SpeechPlayer.jsx         TTS playback component
      ThinkingIndicator.jsx    Animated "thinking" dots indicator
      ThreadList.jsx           Conversation thread list with delete icon
      Toast.jsx                Dismissible toast notification banner
      TopBar.jsx               App-level top bar (unused in current layout)
    api/
      support/route.js         Cloud path: crisis gate → Gemini streaming
      auth/
        login/route.js         JWT-based login
        logout/route.js        Cookie clear
        me/route.js            Session check (no rate limit)
        signup/route.js        User registration
    login/page.jsx             Login page
    signup/page.jsx            Sign-up page
  hooks/
    useSpeechRecognition.js    Web Speech API STT hook
    useSpeechSynthesis.js      Browser TTS hook (speed, highlight)
    useStillpoint.js           Core orchestration: threads, storage, crisis gate, cloud/local pipelines
  lib/
    auth.js                    JWT helpers
    deviceCapability.js        WebGPU / WASM capability detection
    lexicon.js                 Pure data: emotion words, crisis terms
    localai.js                 WebLLM / WASM on-device backend + MODEL_CATALOG
    mongodb.js                 Mongoose connection helper
    nope.js                    NOPE API integration for evaluate & signpost
    prompt.js                  Shared system prompt unifying model behavior
    rate-limit.js              Upstash Redis rate-limit factory
    workers/
      localaiWorker.js         Web Worker entry for WASM path
      wasmEngine.js            Hugging Face Transformers engine wrapper
  models/
    User.js                    Mongoose User schema
package.json                   pnpm-managed
next.config.mjs
postcss.config.mjs
jsconfig.json
```

Where raw text goes:
- **Cloud path** — `useStillpoint.js` POSTs raw text + conversation history to
  `app/api/support/route.js`. The server queries the `NOPE API` for a safety check. 
  If safe, it forwards the context to Gemini via Vercel AI SDK, fetches and ranks resources, 
  and streams the response back as SSE. Raw text is held only for the request's duration; 
  never logged, never persisted.
- **Local AI path** — `useStillpoint.js` runs a static fallback or feeds the raw text directly to
  `lib/localai.js`, which runs the model on-device via WebLLM or WASM. Nothing
  leaves the browser on this path.
- **Crisis gate** — runs via NOPE API on the server. A crisis hit stops the AI path and renders
  ranked crisis resources immediately.

## Getting started

1. Install dependencies: `pnpm install`.
2. Configure environment — copy `.env.example` to `.env.local` and set:
   - `JWT_SECRET` — used for signing/verifying session tokens.
   - `GEMINI_API_KEY` — held only on the server; never reaches the browser.
   - `MONGODB_URI` — MongoDB connection string for user accounts.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — for API rate limiting.
   - `NOPE_BASE_URL` and `NOPE_API_KEY` — for NOPE Safety API integrations.
3. Start the dev server: `pnpm dev`, then open `http://localhost:3000`.
4. Sign in (or create an account) from the app. The cloud path requires
   a session; the Local AI path works without one.
5. Write how you're feeling and share it.

## A note on scope

Stillpoint is a support tool, not a replacement for professional mental
health care. If you or someone you know is in crisis in the US:

- **988** — Suicide & Crisis Lifeline (call or text, 24/7)
- **Text "HELLO" to 741741** — Crisis Text Line
- **911** — if there is immediate danger

International resources: [findahelpline.com](https://findahelpline.com)

## License

MIT
