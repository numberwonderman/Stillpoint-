# Stillpoint

*A quiet place to name what you're feeling.*

Stillpoint is a browser-based, accessibility-first tool for putting words to
difficult emotions. It's built around one question: **how little sensitive
information can we send to an AI while still getting a genuinely useful,
supportive response?**

Built for [Hack for Humanity | Summer 2026](https://hack-for-humanity-summer-26.devpost.com/).

---

## How it works

Your words never leave your device as raw text. Everything typed into
Stillpoint is processed **locally, in the browser**, by a small rule-based
parser. That parser extracts only a minimal, structured summary — broad
emotion categories, an intensity level, and a general context tag — and it's
*that* summary, not your original words, that gets sent to Gemini for a
supportive response.

```
Your words  →  local parser (in-browser)  →  structured summary  →  Gemini
   ↑                    ↑
 never leaves      crisis check happens
 your device        here, first, always
```

If the parser detects crisis language (e.g. language associated with
suicidal ideation or self-harm), Stillpoint **never calls Gemini at all**.
Instead it immediately shows local crisis resources. This check happens
before any other processing and does not depend on having an API key
configured — the safety net works even with zero setup.

## Why this design

Most AI-powered mental health tools send your full, raw message to a
third-party API. Stillpoint takes the opposite approach: send the smallest
possible signal needed to get a caring response, and keep the crisis
safety net entirely local and independent of any API call succeeding.

## Features

- **Local-first parsing** — emotion detection, negation handling, and
  intensity scoring all happen in-browser, with no network call involved.
- **Crisis gate** — a dedicated, always-first check for crisis language that
  bypasses the AI entirely and shows hardcoded support resources.
- **Bring your own key (BYOK)** — you supply your own Gemini API key, held
  only in memory for the session. No backend, no account, no server-side
  storage of your key or your words.
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
      SettingsPanels.jsx       Gemini key + Local AI toggle
      InputSection.jsx         Textarea + submit
      ResponseSection.jsx      Live region (status / response / crisis)
  hooks/
    useStillpoint.js           Orchestration: routes crisis / Gemini / Local AI
  lib/
    lexicon.js                 Pure data: emotion words, crisis terms, etc.
    parser.js                  Local text parsing — crisis gate, negation, ...
    gemini.js                  The only file that talks to the network
    localai.js                 Optional WebLLM (on-device) backend
package.json                   pnpm-managed
next.config.mjs
postcss.config.mjs
jsconfig.json
```

Raw user text is handled only by `useStillpoint.js` and `parser.js`. It is
never passed to `gemini.js`, logged, or persisted anywhere.

## Getting started

1. Install dependencies: `pnpm install`.
2. Get a free Gemini API key from [Google AI
   Studio](https://aistudio.google.com/app/apikey).
3. Start the dev server: `pnpm dev`, then open `http://localhost:3000`.
4. Open the **Settings** panel in the app and paste your key in. It's kept
   in memory for that browser tab only.
5. Write how you're feeling and share it.

## A note on scope

Stillpoint is a support tool, not a replacement for professional mental
health care. If you or someone you know is in crisis in the US:

- **988** — Suicide & Crisis Lifeline (call or text, 24/7)
- **Text "HELLO" to 741741** — Crisis Text Line
- **911** — if there is immediate danger

## Tech

Next.js 15 (App Router) + React 19, JavaScript, Tailwind CSS v4. Package
manager: pnpm. The Gemini API is still accessed directly from the
browser via a user-supplied BYOK key — there is no server-side proxy,
no env-stored key, and no backend. The optional Local AI mode runs a
small WebLLM model entirely on-device via WebGPU.

## License

MIT
