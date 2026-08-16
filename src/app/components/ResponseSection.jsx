"use client";

import { useState } from "react";
import ThinkingIndicator from "./ThinkingIndicator";

/**
 * ResponseSection — the live region.
 * Renders exactly one of: crisis panel, supportive response, or status/error.
 * The crisis panel is shown any time the parser's crisis gate fires —
 * including on the Local AI path, where the in-flight generation has
 * already been aborted by the hook before this component is rendered.
 */
export default function ResponseSection({ status, error, crisis, response, localAIInferring, localAIStopped }) {
  return (
    <section aria-labelledby="response-heading" className="mb-7">
      <h2 id="response-heading" className="sr-only">
        Response
      </h2>
      <p
        id="status"
        className={`status min-h-[1.4em] text-base ${
          error ? "font-bold text-crisis" : "text-text-muted"
        }`}
        aria-live="polite"
      >
        {localAIInferring ? (
          <ThinkingIndicator label="Thinking on-device" />
        ) : (
          status || (error ? error : "")
        )}
      </p>
      <div id="output" aria-live="polite">
        {crisis ? (
          <CrisisPanel localAIStopped={localAIStopped} />
        ) : response ? (
          <SupportiveResponse text={response} streaming={localAIInferring} />
        ) : null}
      </div>
    </section>
  );
}

const CRISIS_PLAIN_TEXT = [
  "If you're in the US and in immediate danger, call 911.",
  "988 — Suicide & Crisis Lifeline: call or text, 24/7.",
  'Crisis Text Line: text "HELLO" to 741741 (US/Canada).',
  "Outside the US: findahelpline.com lists free, confidential helplines in 130+ countries.",
  "The Trevor Project (LGBTQ+ youth): 1-866-488-7386 or text START to 678-678.",
  "Veterans Crisis Line: dial 988 then press 1, or text 838255.",
  "You don't have to figure this out by yourself.",
].join("\n");

function CrisisPanel({ localAIStopped }) {
  const [copied, setCopied] = useState(false);

  async function copyResources() {
    try {
      await navigator.clipboard.writeText(CRISIS_PLAIN_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  return (
    <div
      className="crisis-panel rounded-[10px] border-2 border-crisis bg-crisis-bg p-6"
      role="alert"
      aria-labelledby="crisis-heading"
    >
      <h2
        id="crisis-heading"
        className="mb-2 mt-0 text-[1.375rem] font-bold text-crisis"
      >
        You&apos;re not alone right now
      </h2>
      <p className="mb-4">
        What you&apos;re feeling matters, and there are people who want to
        help you get through the next few minutes. You don&apos;t have to
        be in immediate danger to reach out — you can call or text even if
        you&apos;re just not sure you&apos;re safe.
      </p>

      {localAIStopped && (
        <p
          className="mb-4 rounded-card border border-crisis/40 bg-bg/60 p-3 text-[0.9rem]"
          data-testid="crisis-local-stopped"
        >
          <strong>Heads up:</strong> the on-device response was stopped the
          moment this page recognized what you wrote. You won&apos;t see any
          more of it, and nothing about what you wrote left your browser.
          These resources below are the only thing on screen now.
        </p>
      )}

      <h3 className="mb-2 text-[1.0625rem] font-bold">Right now in the US</h3>
      <ul className="m-0 mb-4 list-none p-0">
        <li className="mb-2">
          <strong>988</strong> — Suicide &amp; Crisis Lifeline.
          Call or text, 24/7. Free and confidential. If you&apos;re not sure
          what to say, you can start with{" "}
          <em>&ldquo;I&apos;m not okay and I don&apos;t know what to do.&rdquo;</em>
        </li>
        <li className="mb-2">
          <strong>Text &ldquo;HELLO&rdquo; to 741741</strong> — Crisis Text Line.
          A trained counselor will text you back. Average wait is under a minute.
        </li>
        <li className="mb-2">
          <strong>911</strong> — if you are in immediate physical danger.
        </li>
      </ul>

      <h3 className="mb-2 text-[1.0625rem] font-bold">Specialized (US)</h3>
      <ul className="m-0 mb-4 list-none p-0">
        <li className="mb-2">
          <strong>The Trevor Project</strong> (LGBTQ+ young people, 24/7):
          call <strong>1-866-488-7386</strong> or text{" "}
          <strong>START</strong> to <strong>678-678</strong>.
        </li>
        <li className="mb-2">
          <strong>Veterans Crisis Line</strong>: dial <strong>988</strong> then
          press <strong>1</strong>, or text <strong>838255</strong>.
        </li>
      </ul>

      <h3 className="mb-2 text-[1.0625rem] font-bold">Outside the US</h3>
      <p className="mb-2">
        Helplines are free and confidential in most countries, and many offer
        chat or text if a voice call feels like too much. Two directories
        cover the widest range of regions:
      </p>
      <ul className="m-0 mb-4 list-none p-0">
        <li className="mb-2">
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-crisis underline"
          >
            findahelpline.com
          </a>{" "}
          — free, confidential helplines in 130+ countries, searchable by
          region and language.
        </li>
        <li className="mb-2">
          <a
            href="https://www.befrienders.org"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-crisis underline"
          >
            Befrienders Worldwide
          </a>{" "}
          — a directory centred on emotional-support lines in over 30
          countries, with links to local numbers and, where available,
          email or chat.
        </li>
      </ul>

      <h3 className="mb-2 text-[1.0625rem] font-bold">What to expect when you reach out</h3>
      <ul className="m-0 mb-4 list-none p-0">
        <li className="mb-2">
          A real person answers — trained, supervised, and used to hearing
          the worst day of someone&apos;s week. You won&apos;t be put on hold
          while they decide what to do.
        </li>
        <li className="mb-2">
          You don&apos;t have to explain everything, or explain it well.
          <em> &ldquo;I&apos;m having a hard time and I need someone to talk to&rdquo;</em>{" "}
          is a complete sentence. They&apos;ll guide the conversation from there.
        </li>
        <li className="mb-2">
          Nothing is recorded against your name. Calls and texts aren&apos;t
          shared with insurance, employers, or family — and you can hang up
          or stop texting at any point.
        </li>
        <li className="mb-2">
          If a counselor thinks you&apos;re in immediate danger, they&apos;ll
          stay on the line with you and help arrange the next step. They
          won&apos;t send police to your door without trying to talk it
          through with you first.
        </li>
      </ul>

      <h3 className="mb-2 text-[1.0625rem] font-bold">If calling feels too big</h3>
      <p className="mb-4">
        Text and chat lines are a real alternative — some people find typing
        easier than speaking. Most of the directories above list both.
        Whichever you choose, you can stop at any time.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copyResources}
          className="min-h-10 rounded-[10px] border-2 border-crisis px-4 py-2 text-[0.95rem] font-bold text-crisis hover:bg-crisis hover:text-bg focus-visible:outline-2 focus-visible:outline-focus"
        >
          {copied ? "Copied to clipboard" : "Copy these resources"}
        </button>
        <span className="text-[0.85rem] text-text-muted">
          Useful if you want to save them or send them to someone you trust.
        </span>
      </div>

      <p className="m-0 text-[0.95rem]">
        If you can, please reach out to one of these right now — or show this
        page to someone nearby and ask them to stay with you while you do.
        You don&apos;t have to figure this out by yourself.
      </p>
    </div>
  );
}

function SupportiveResponse({ text, streaming }) {
  return (
    <p className="supportive-response m-0 rounded-[10px] border border-border border-l-4 border-l-accent bg-surface px-6 py-5">
      {text}
      {streaming && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1em] w-[0.5ch] translate-y-[0.15em] animate-pulse bg-accent"
        />
      )}
    </p>
  );
}
