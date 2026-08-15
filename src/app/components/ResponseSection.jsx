"use client";

import ThinkingIndicator from "./ThinkingIndicator";

/**
 * ResponseSection — the live region.
 * Renders exactly one of: crisis panel, supportive response, or status/error.
 * Crisis panel content is byte-for-byte the same as the old
 * `CRISIS_RESOURCES_HTML` in app.js.
 */
export default function ResponseSection({ status, error, crisis, response, localAIInferring }) {
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
        {crisis ? <CrisisPanel /> : response ? <SupportiveResponse text={response} streaming={localAIInferring} /> : null}
      </div>
    </section>
  );
}

function CrisisPanel() {
  return (
    <div className="crisis-panel rounded-[10px] border-2 border-crisis bg-crisis-bg p-6" role="alert">
      <h2 className="mb-2 mt-0 text-[1.375rem] font-bold text-crisis">
        You&apos;re not alone right now
      </h2>
      <p>What you&apos;re feeling matters, and immediate support is available:</p>
      <ul className="my-3 pl-5">
        <li className="mb-2">
          <strong>988</strong> — Suicide &amp; Crisis Lifeline (call or text, 24/7)
        </li>
        <li className="mb-2">
          <strong>Text &quot;HELLO&quot; to 741741</strong> — Crisis Text Line
        </li>
        <li className="mb-2">
          <strong>911</strong> — if you are in immediate danger
        </li>
      </ul>
      <p>If you&apos;re able to, please reach out to one of these right now.</p>
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
