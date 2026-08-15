/**
 * SiteFrame — header (breathing ring + title + tagline) and footer.
 * Server component, no client JS.
 *
 * The breathing ring is a single empty div with the `.animate-breathe`
 * class (defined in globals.css). prefers-reduced-motion disables it.
 */
export default function SiteFrame({ children }) {
  return (
    <>
      <a
        href="#main"
        className="absolute left-[-9999px] top-0 z-50 rounded-none rounded-br-[10px] bg-focus px-5 py-3 font-bold text-bg focus:left-0"
      >
        Skip to main content
      </a>

      <header className="mx-auto max-w-[640px] px-6 pt-12 pb-8 text-center sm:pt-8 sm:pb-6">
        <div
          aria-hidden="true"
          className="animate-breathe mx-auto mb-5 h-12 w-12 rounded-full border-[3px] border-accent"
        />
        <h1 className="mb-2 text-4xl font-bold tracking-tight sm:text-[1.875rem]">
          Stillpoint
        </h1>
        <p className="m-0 text-text-muted">A quiet place to name what you&apos;re feeling</p>
      </header>

      <main id="main" className="mx-auto max-w-[640px] px-6 pb-12">
        {children}
      </main>

      <footer className="mx-auto max-w-[640px] border-t border-border px-6 py-6 pb-12 text-center text-sm text-text-muted">
        <p className="m-0">
          Stillpoint keeps your words on your device. Only a short, general
          summary of your emotions is ever sent — and never during a crisis.
        </p>
      </footer>
    </>
  );
}
