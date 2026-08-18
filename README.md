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

**Cloud path** — the typed text is sent to `/api/support` on the server.
After passing through a mandatory **Crisis Gate**, the original message (and recent conversation turns maintained in browser `sessionStorage`) is sent directly to Gemini. The Gemini API key lives only on the server; conversational messages are never logged or stored in any database.

**Local AI path** — if you've turned on Local AI mode, your typed text
stays on your device. It is fed directly to the on-device model that
runs in your browser (WebGPU when available, otherwise WebAssembly in a
Web Worker). The server is never contacted on this path.

```
                  ┌──────────────────────────────────┐
                  │   client-side crisis gate (1st)  │
                  └───────────────┬──────────────────┘
                                  │ if not crisis
              ┌───────────────────┴───────────────────┐
              │                                       │
       Local AI path                          Cloud path
              │                                       │
              ▼                                       ▼
     raw text to on-device           raw text → /api/support
     model in browser                → server crisis gate
     (no network call)               → direct message to Gemini
              │                        (session storage context)
              ▼                                       │
     streamed response                        ▼
     in the UI                       response from Gemini
                                     returned to the UI
```

The client also runs the same crisis gate first, before either
path is taken. If the gate fires — for language associated with suicidal
ideation or self-harm — Stillpoint **never calls Gemini and never talks
to the local model**. Instead it immediately shows a crisis panel with
immediate-support resources (US: 988, Crisis Text Line, 911, The Trevor
Project, Veterans Crisis Line; international: findahelpline.com), what
to expect when calling, and a "copy these resources" button. If a local
generation was in flight, it is aborted so the panel doesn't appear next
to a half-finished AI reply. This check happens in the browser and does
not depend on having an API key configured, a session cookie, or a
working network connection. The server runs the same gate independently
as a second line of defense.

## Why this design

Stillpoint protects user privacy through ephemeral data retention: conversation context is kept only in browser `sessionStorage` during your session and is never persisted to any database. On the cloud path, messages are decoupled from user identity and protected by a mandatory Crisis Gate. On the Local AI path, nothing leaves your device at all.

## Features

- **Browser session storage** — active threads and chat history remain in `sessionStorage` for context continuity without permanent database retention.
- **Crisis gate** — a dedicated, always-first check for crisis language that
  bypasses the AI entirely and shows hardcoded support resources.
- **Bring your own key (BYOK)** is no longer required — the cloud path uses a server-held key, so any signed-in user can use it. If you'd
  rather keep everything on-device, toggle **Local AI mode** in Settings.
- **Direct streaming with Gemini** — after passing the Crisis Gate, messages flow directly to Gemini to preserve nuance and conversational quality.
- **Accessibility-first UI** — set in [Atkinson Hyperlegible
  Next](https://brailleinstitute.org/freefont), a typeface designed by the
  Braille Institute for low-vision readability. High-contrast dark palette,
  large touch targets, full keyboard navigation, visible focus states, and
  `prefers-reduced-motion` support throughout.

## Project structure

```
src/
  app/
    layout.jsx                 HTML shell, font, global CSS
    page.jsx                   Top-level page (client component)
    globals.css                Tailwind v4 + @theme design tokens
    _components/
      SiteFrame.jsx            Header / skip link / footer
      SettingsPanels.jsx       Local AI toggle
      InputSection.jsx         Textarea + submit
      ResponseSection.jsx      Live region (status / response / crisis)
    api/
      support/route.js         Cloud path: server-side parser → Gemini
      auth/                    Sign in / sign up / sign out
  hooks/
    useStillpoint.js           Orchestration: crisis gate → cloud or local
  lib/
    lexicon.js                 Pure data: emotion words, crisis terms, etc.
    parser.js                  Pure rule-based text → structured summary
    localai.js                 Optional on-device (WebLLM / WASM) backend
    workers/                   Web Worker for the WASM transformers path
package.json                   pnpm-managed
next.config.mjs
postcss.config.mjs
jsconfig.json
```

Where raw text goes:
- **Cloud path** — `useStillpoint.js` sends the raw text to
  `app/api/support/route.js`, which calls `parser.js` and forwards the
  structured summary to Gemini. Raw text is held only for the request's
  duration, never logged, never persisted.
- **Local AI path** — `useStillpoint.js` feeds the raw text directly to
  `lib/localai.js`, which runs the model on-device. Nothing leaves the
  browser on this path.
- **Crisis gate** — runs in the browser before either branch, and again
  on the server for the cloud path. A crisis hit stops both paths.

## Getting started

1. Install dependencies: `pnpm install`.
2. Configure environment — copy `.env.example` to `.env.local` and set
   `JWT_SECRET` and `GEMINI_API_KEY`. The Gemini key is held only on the
   server; it never reaches the browser.
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

## License

MIT
