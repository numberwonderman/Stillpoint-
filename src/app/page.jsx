import Link from "next/link";

export const metadata = {
  title: "Stillpoint — a quiet place to name what you're feeling",
  description:
    "Stillpoint is a private, on-device tool for naming difficult emotions. Your words stay on your device.",
};

const FEATURES = [
  {
    icon: "🔒",
    title: "Private by design",
    body:
      "Your raw words never leave your device. Only a short, general emotion summary is ever sent — and never during a crisis.",
  },
  {
    icon: "💻",
    title: "Runs on your device",
    body:
      "Local AI mode downloads a small model straight into your browser, so you can get support with nothing sent anywhere at all.",
  },
  {
    icon: "🧭",
    title: "Sized to your device",
    body:
      "Stillpoint checks your device's memory and GPU and recommends a model that will actually run well — no guesswork.",
  },
  {
    icon: "🛟",
    title: "Crisis-aware",
    body:
      "If what you write signals a crisis, Stillpoint skips AI entirely and shows crisis resources immediately, every time.",
  },
];

export default function LandingPage() {
  return (
    <main>
      {/* -------- Hero -------- */}
      <section className="mx-auto max-w-[720px] px-6 pb-16 pt-12 text-center sm:pt-6">
        <div
          aria-hidden="true"
          className="animate-breathe mx-auto mb-6 h-14 w-14 rounded-full border-[3px] border-accent"
        />
        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-[2.25rem]">
          A quiet place to name what you&apos;re feeling
        </h1>
        <p className="mx-auto mb-8 max-w-[520px] text-lg text-text-muted">
          Stillpoint helps you put words to a hard moment and get a short,
          grounding response back — privately. Your words stay on your
          device; nothing you write is ever stored.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            className="min-h-12 rounded-[10px] px-8 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:text-text"
          >
            Try Stillpoint now
          </Link>
          <Link
            href="/signup"
            className="min-h-12 rounded-[10px] border-2 border-border bg-transparent px-8 py-3 text-[1.0625rem] font-bold text-text transition-colors hover:border-accent"
          >
            Create a free account
          </Link>
        </div>
        <p className="mt-4 text-[0.9rem] text-text-muted">
          No account needed to use the tool. Ever.
        </p>
      </section>

      {/* -------- Features -------- */}
      <section className="mx-auto max-w-[880px] px-6 pb-16">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-card border border-border bg-surface p-6 transition-colors hover:border-accent/50"
            >
              <span aria-hidden="true" className="mb-3 block text-3xl">
                {f.icon}
              </span>
              <h2 className="mb-2 text-[1.15rem] font-bold">{f.title}</h2>
              <p className="m-0 text-text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* -------- How it works -------- */}
      <section className="mx-auto max-w-[720px] px-6 pb-16">
        <h2 className="mb-6 text-center text-[1.75rem] font-bold">How it works</h2>
        <ol className="m-0 grid gap-4 p-0" style={{ listStyle: "none" }}>
          <Step n="1" title="Write how you're feeling">
            Nothing you type leaves your device — it&apos;s parsed locally into a
            short emotional summary.
          </Step>
          <Step n="2" title="Choose cloud or on-device">
            Use your own free Gemini key, or switch to Local AI mode to run a
            small model entirely in your browser.
          </Step>
          <Step n="3" title="Get a grounding response">
            A short, warm response comes back in seconds — never clinical,
            never generic.
          </Step>
        </ol>
      </section>

      {/* -------- Footer CTA -------- */}
      <section className="mx-auto max-w-[640px] px-6 pb-20 text-center">
        <Link
          href="/app"
          className="inline-block min-h-12 rounded-[10px] px-8 py-3 text-[1.0625rem] font-bold text-bg transition-colors hover:text-text text-white"
        >
          Open Stillpoint
        </Link>
      </section>

      <footer className="mx-auto max-w-[640px] border-t border-border px-6 py-6 pb-12 text-center text-sm text-text-muted">
        <p className="m-0">
          Stillpoint keeps your words on your device. Only a short, general
          summary of your emotions is ever sent — and never during a crisis.
        </p>
      </footer>
    </main>
  );
}

function Step({ n, title, children }) {
  return (
    <li className="flex gap-4 rounded-card border border-border bg-surface p-5 text-left">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-bold text-accent"
      >
        {n}
      </span>
      <div>
        <h3 className="mb-1 text-[1.0625rem] font-bold">{title}</h3>
        <p className="m-0 text-text-muted">{children}</p>
      </div>
    </li>
  );
}
