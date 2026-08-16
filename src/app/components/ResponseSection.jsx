"use client";

import { useState, useEffect, useRef } from "react";
import ThinkingIndicator from "./ThinkingIndicator";

/**
 * ResponseSection — the live region.
 * Renders exactly one of: crisis panel, supportive response, or status/error.
 * The crisis panel is shown any time the parser's crisis gate fires —
 * including on the Local AI path, where the in-flight generation has
 * already been aborted by the hook before this component is rendered.
 *
 * Crisis panel structure (intentionally progressive — when someone is in
 * distress they shouldn't have to scan a wall of options):
 *   1. One calm, validating line.
 *   2. Region selector if we don't know yet (US vs outside the US).
 *   3. One primary action: the single most-likely-helpful resource for
 *      that region (988 for US, findahelpline.com for intl) as a big
 *      tappable button with phone/SMS/url deep-links.
 *   4. A "More options" disclosure that opens a tidy list of every
 *      other resource — crisis text lines, specialized lines, what to
 *      expect, alternatives to calling.
 */
export default function ResponseSection({
  status,
  error,
  crisis,
  response,
  localAIInferring,
  localAIStopped,
  crisisRegion,
  onChooseCrisisRegion,
}) {
  const sectionRef = useRef(null);
  const prevHasContentRef = useRef(false);

  useEffect(() => {
    const hasContent = !!(crisis || response);
    if (hasContent && !prevHasContentRef.current) {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        sectionRef.current?.focus?.({ preventScroll: true });
      } catch {
      }
    }
    prevHasContentRef.current = hasContent;
  }, [crisis, response]);
  return (
    <section ref={sectionRef} tabIndex={-1} aria-labelledby="response-heading" className="mb-7">
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
          <CrisisPanel
            localAIStopped={localAIStopped}
            region={crisisRegion}
            onChooseRegion={onChooseCrisisRegion}
          />
        ) : response ? (
          <SupportiveResponse text={response} streaming={localAIInferring} />
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CrisisPanel
// ---------------------------------------------------------------------------

// Plain-text version used by "Copy resources". Kept terse so it fits
// comfortably in a clipboard paste and is still scannable.
const CRISIS_PLAIN_TEXT = `If you're in the US and in immediate danger, call 911.

988 — Suicide & Crisis Lifeline: call or text, 24/7.
Crisis Text Line: text HELLO to 741741 (US/Canada).
The Trevor Project (LGBTQ+ youth): 1-866-488-7386 or text START to 678-678.
Veterans Crisis Line: dial 988 then press 1, or text 838255.

Outside the US: findahelpline.com — free, confidential helplines in 130+ countries.

You don't have to figure this out by yourself.`;

// Primary resources — one per region, surfaced as the big first action.
// `for` is a single short line telling the user who this number is for.
// `callHref` / `smsHref` use real tel:/sms: deep links.
const US_PRIMARY = {
  name: "988 Suicide & Crisis Lifeline",
  for: "Anyone in emotional distress or suicidal crisis.",
  meta: "Free · Confidential · 24/7",
  callHref: "tel:988",
  smsHref: "sms:988",
  callLabel: "Call 988",
  smsLabel: "Text 988",
};

const INTL_PRIMARY = {
  name: "findahelpline.com",
  for: "Anyone outside the US. Search by country and language.",
  meta: "Free · Confidential · 130+ countries",
  href: "https://findahelpline.com",
  cta: "Open findahelpline.com",
};

// Each helpline card explains in one short line who it's for, so the
// user can self-select without reading a paragraph. The button labels
// match the action they perform (call vs text) so the tap target tells
// the user what will happen.
const US_HELPLINES = [
  {
    id: "988",
    name: "988 Lifeline",
    for: "Anyone in crisis. The main US number.",
    actions: [
      { kind: "call", label: "Call 988", href: "tel:988" },
      { kind: "sms", label: "Text 988", href: "sms:988" },
    ],
  },
  {
    id: "911",
    name: "911",
    for: "Immediate physical danger only.",
    actions: [{ kind: "call", label: "Call 911", href: "tel:911" }],
  },
  {
    id: "crisis-text",
    name: "Crisis Text Line",
    for: "If typing feels easier than talking.",
    actions: [{ kind: "sms", label: "Text HELLO to 741741", href: "sms:741741&body=HELLO" }],
  },
  {
    id: "trevor",
    name: "Trevor Project",
    for: "LGBTQ+ young people, 24/7.",
    actions: [
      { kind: "call", label: "Call 1-866-488-7386", href: "tel:18664887386" },
      { kind: "sms", label: "Text START to 678-678", href: "sms:678678&body=START" },
    ],
  },
  {
    id: "veterans",
    name: "Veterans Crisis Line",
    for: "Veterans, service members, and families.",
    actions: [
      { kind: "call", label: "Call 988, then press 1", href: "tel:988" },
      { kind: "sms", label: "Text 838255", href: "sms:838255" },
    ],
  },
];

const INTL_HELPLINES = [
  {
    id: "findahelpline",
    name: "findahelpline.com",
    for: "Free, confidential lines in 130+ countries. Search by region and language.",
    actions: [
      { kind: "link", label: "Open findahelpline.com", href: "https://findahelpline.com", external: true },
    ],
  },
  {
    id: "befrienders",
    name: "Befrienders Worldwide",
    for: "Emotional-support lines in 30+ countries. Local numbers, email, and chat.",
    actions: [
      { kind: "link", label: "Open befrienders.org", href: "https://www.befrienders.org", external: true },
    ],
  },
  {
    id: "crisis-text-intl",
    name: "Crisis Text Line",
    for: "US, Canada, UK, and Ireland. If typing feels easier than talking.",
    actions: [{ kind: "sms", label: "Text HELLO to 741741", href: "sms:741741&body=HELLO" }],
  },
];

function CrisisPanel({ localAIStopped, region, onChooseRegion }) {
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
      className="crisis-panel rounded-[12px] border-2 border-crisis bg-crisis-bg p-5 leading-relaxed sm:p-6"
      role="alert"
      aria-labelledby="crisis-heading"
    >
      <h2
        id="crisis-heading"
        className="mb-3 mt-0 text-[1.5rem] font-bold leading-tight text-crisis sm:text-[1.625rem]"
      >
        You&apos;re not alone right now
      </h2>
      <p className="mb-5 text-[1.0625rem] leading-relaxed text-text">
        Please reach out. You don&apos;t have to be in immediate danger to
        call or text.
      </p>

      {localAIStopped && (
        <p
          className="mb-5 rounded-[8px] border border-crisis/40 bg-bg/60 p-3 text-[0.95rem] leading-relaxed"
          data-testid="crisis-local-stopped"
        >
          <strong>Heads up:</strong> the on-device response was stopped the
          moment this page recognized what you wrote. Nothing about what you
          wrote left your browser. The resources below are the only thing on
          screen now.
        </p>
      )}

      {!region ? (
        <RegionChooser onChoose={onChooseRegion} />
      ) : (
        <PrimaryResource region={region} />
      )}

      <HelplineList region={region} />

      <DetailsDisclosure region={region} onSwitchRegion={onChooseRegion} onCopy={copyResources} copied={copied} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RegionChooser — first thing a user sees if we don't know their region yet.
// Two big buttons. No copy-heavy prose, no links to read — just pick one.
// ---------------------------------------------------------------------------
function RegionChooser({ onChoose }) {
  return (
    <div className="mb-5 rounded-[10px] border border-crisis/30 bg-bg/70 p-4 sm:p-5">
      <p className="mb-1 text-[1.0625rem] font-bold leading-snug text-text">
        Where are you right now?
      </p>
      <p className="mb-4 text-[0.95rem] leading-relaxed text-text-muted">
        This picks the right emergency number.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose("us")}
          className="min-h-[3.25rem] rounded-[10px] border-2 border-accent bg-accent px-4 py-3 text-[1.0625rem] font-bold leading-snug text-bg transition-colors hover:bg-accent-strong hover:text-text"
        >
          I&apos;m in the US
        </button>
        <button
          type="button"
          onClick={() => onChoose("intl")}
          className="min-h-[3.25rem] rounded-[10px] border-2 border-border bg-bg px-4 py-3 text-[1.0625rem] font-bold leading-snug text-text transition-colors hover:border-accent"
        >
          I&apos;m outside the US
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrimaryResource — the single most-likely-helpful action for the region.
// Big tap targets, real tel:/sms:/https deep-links.
// ---------------------------------------------------------------------------
function PrimaryResource({ region }) {
  if (region === "us") {
    return (
      <div className="mb-5 rounded-[10px] border-2 border-crisis bg-bg p-4 sm:p-5">
        <p className="mb-2 text-[0.8125rem] font-bold uppercase tracking-wider text-crisis">
          Call or text right now
        </p>
        <h3 className="mb-1 text-[1.25rem] font-bold leading-tight text-text sm:text-[1.375rem]">
          {US_PRIMARY.name}
        </h3>
        <p className="mb-4 text-[1rem] leading-relaxed text-text">
          {US_PRIMARY.for}
        </p>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={US_PRIMARY.callHref}
            className="inline-flex min-h-[3.25rem] items-center justify-center rounded-[10px] bg-crisis px-4 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:opacity-90"
          >
            {US_PRIMARY.callLabel}
          </a>
          <a
            href={US_PRIMARY.smsHref}
            className="inline-flex min-h-[3.25rem] items-center justify-center rounded-[10px] border-2 border-crisis px-4 py-3 text-[1.0625rem] font-bold text-crisis transition-colors hover:bg-crisis hover:text-bg"
          >
            {US_PRIMARY.smsLabel}
          </a>
        </div>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-text-muted">
          {US_PRIMARY.meta}. Not sure what to say?{" "}
          <em>&ldquo;I&apos;m not okay and I don&apos;t know what to do.&rdquo;</em> works.
        </p>
      </div>
    );
  }

  // intl
  return (
    <div className="mb-5 rounded-[10px] border-2 border-crisis bg-bg p-4 sm:p-5">
      <p className="mb-2 text-[0.8125rem] font-bold uppercase tracking-wider text-crisis">
        Open right now
      </p>
      <h3 className="mb-1 text-[1.25rem] font-bold leading-tight text-text sm:text-[1.375rem]">
        {INTL_PRIMARY.name}
      </h3>
      <p className="mb-4 text-[1rem] leading-relaxed text-text">
        {INTL_PRIMARY.for}
      </p>
      <a
        href={INTL_PRIMARY.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[3.25rem] items-center justify-center rounded-[10px] bg-crisis px-5 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:opacity-90"
      >
        {INTL_PRIMARY.cta}
      </a>
      <p className="mt-3 text-[0.875rem] leading-relaxed text-text-muted">
        {INTL_PRIMARY.meta}. Many lines offer chat or text.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HelplineList — a flat list of cards, one per helpline for the region.
// Each card answers the two questions a person in distress has: "what is
// this number for?" and "what do I do?". Tapping the action button does
// the actual call/text/open.
// ---------------------------------------------------------------------------
function HelplineList({ region }) {
  const items = region === "us" ? US_HELPLINES : INTL_HELPLINES;

  return (
    <div className="mb-5">
      <h3 className="mb-3 text-[1.0625rem] font-bold leading-snug text-text">
        {region === "us" ? "Other US numbers" : "Other international options"}
      </h3>
      <ul className="m-0 list-none space-y-2 p-0">
        {items
          .filter((h) => h.id !== (region === "us" ? "988" : "findahelpline")) // already shown as primary
          .map((h) => (
            <HelplineCard key={h.id} helpline={h} />
          ))}
      </ul>
    </div>
  );
}

function HelplineCard({ helpline }) {
  return (
    <li className="rounded-[10px] border border-border bg-bg/70 p-3 sm:p-4">
      <p className="mb-1 text-[1.0625rem] font-bold leading-snug text-text">
        {helpline.name}
      </p>
      <p className="mb-3 text-[0.95rem] leading-relaxed text-text-muted">
        <span className="mr-1 text-text-muted">For:</span>
        {helpline.for}
      </p>
      <div className="flex flex-wrap gap-2">
        {helpline.actions.map((a, i) => (
          <a
            key={`${helpline.id}-${i}`}
            href={a.href}
            target={a.external ? "_blank" : undefined}
            rel={a.external ? "noopener noreferrer" : undefined}
            className="inline-flex min-h-[2.75rem] items-center rounded-[8px] border-2 border-crisis px-3 py-2 text-[0.95rem] font-bold leading-snug text-crisis transition-colors hover:bg-crisis hover:text-bg"
          >
            {a.label}
          </a>
        ))}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// DetailsDisclosure — collapsed-by-default disclosure for non-urgent info
// (what to expect when calling, copy-resources, region switch). The label
// actually describes what's inside, not just "more options".
// ---------------------------------------------------------------------------
function DetailsDisclosure({ region, onSwitchRegion, onCopy, copied }) {
  const [open, setOpen] = useState(false);
  const otherLabel = region === "us" ? "Show outside-US resources" : "Show US resources";
  const otherRegion = region === "us" ? "intl" : "us";

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="crisis-details"
        className="flex w-full min-h-[2.75rem] items-center justify-between rounded-[10px] border border-border bg-bg/40 px-4 py-3 text-left text-[0.95rem] font-bold leading-snug text-text transition-colors hover:border-accent"
      >
        <span>{open ? "Hide details" : "What to expect, copy, and other info"}</span>
        <span aria-hidden="true" className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div id="crisis-details" className="mt-4 space-y-5 rounded-[10px] border border-border bg-bg/50 p-4 sm:p-5">
          <WhatToExpect />
          <CopyBlock onCopy={onCopy} copied={copied} />
          <div className="rounded-[8px] border border-border bg-bg/60 p-3 text-[0.95rem] leading-relaxed text-text-muted">
            Wrong region?{" "}
            <button
              type="button"
              onClick={() => onSwitchRegion(otherRegion)}
              className="font-bold text-crisis underline hover:opacity-80"
            >
              {otherLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatToExpect() {
  return (
    <div>
      <h4 className="mb-2 text-[1rem] font-bold leading-snug text-text">
        What happens when you reach out
      </h4>
      <ul className="m-0 list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed text-text-muted">
        <li>A real, trained person answers. They&apos;re used to hard calls.</li>
        <li>You don&apos;t have to explain everything. <em>&ldquo;I&apos;m having a hard time&rdquo;</em> is enough.</li>
        <li>Calls and texts are confidential. Nothing goes to insurance, employers, or family.</li>
        <li>If you&apos;re in danger, they stay on the line and help. They don&apos;t send police without trying to talk it through first.</li>
      </ul>
    </div>
  );
}

function CopyBlock({ onCopy, copied }) {
  return (
    <div>
      <h4 className="mb-2 text-[1rem] font-bold leading-snug text-text">
        Save or send these
      </h4>
      <button
        type="button"
        onClick={onCopy}
        className="min-h-[2.75rem] rounded-[10px] border-2 border-crisis px-4 py-2 text-[0.95rem] font-bold leading-snug text-crisis hover:bg-crisis hover:text-bg focus-visible:outline-2 focus-visible:outline-focus"
      >
        {copied ? "Copied to clipboard" : "Copy all resources"}
      </button>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-text-muted">
        Paste into a text to yourself or someone you trust.
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
