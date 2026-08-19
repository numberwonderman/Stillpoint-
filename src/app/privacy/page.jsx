import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Stillpoint",
  description: "How Stillpoint protects your privacy and keeps your data yours.",
};

const SECTIONS = [
  {
    number: "01",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="privacy-icon">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "No Message Storage",
    body: "Stillpoint is designed to be a safe, transient space. We do not store your conversation messages in any database. The messages you send are processed in real-time and only exist within your active browser session — they vanish the moment you close the tab.",
    highlight: "Your words are never written to disk.",
  },
  {
    number: "02",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="privacy-icon">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Cloud Mode & Safety Evaluation",
    body: "When using the standard Cloud Mode, your messages are briefly routed through our server to generate a supportive response using Google's Gemini models. Before any AI response is generated, we use the NOPE Safety API to check if the content signals a crisis. This evaluation is never stored or linked to your identity — it exists solely to surface emergency resources if you need them.",
    highlight: "Safety checks are ephemeral and anonymous.",
  },
  {
    number: "03",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="privacy-icon">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: "Local Privacy Mode",
    body: "If you prefer zero data leaving your device, switch to Local Privacy Mode. A small language model runs entirely inside your browser using WebGPU. No messages, no queries, no telemetry are sent to any external server. Absolute privacy, guaranteed by architecture.",
    highlight: "Local mode means nothing leaves your device. Ever.",
  },
  {
    number: "04",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="privacy-icon">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    title: "Authentication",
    body: "Authentication exists strictly as a rate-limiting mechanism to prevent abuse of the cloud services. Your account details — email, username — are never associated with your chat history, because your chat history is never saved on our servers. We cannot hand over what we do not have.",
    highlight: "Account data and chat history are never linked.",
  },
  {
    number: "05",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="privacy-icon">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
    title: "Resource Retrieval",
    body: "If Stillpoint detects that you may benefit from external support, it may query the NOPE Signpost API to retrieve contextually relevant mental health resources. This query contains no personally identifiable information — only a general topic category, never your message content.",
    highlight: "Resource lookups are anonymous and non-identifying.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <style>{`
        .privacy-page {
          min-height: 100vh;
          background: var(--color-bg);
          color: var(--color-text);
          position: relative;
        }
        .privacy-glow-top {
          position: fixed;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(111,191,174,0.06) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .privacy-glow-bottom {
          position: fixed;
          bottom: 10%;
          right: -10%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(80,163,146,0.04) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .privacy-container {
          position: relative;
          max-width: 780px;
          margin: 0 auto;
          padding: 4rem 1.5rem;
        }
        .privacy-header {
          text-align: center;
          margin-bottom: 3.5rem;
        }
        .privacy-orb {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 2px solid var(--color-accent);
          background: radial-gradient(circle at 35% 35%, rgba(111,191,174,0.18), transparent 70%);
          margin: 0 auto 1.5rem;
        }
        .privacy-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(111,191,174,0.1);
          border: 1px solid rgba(111,191,174,0.25);
          border-radius: 9999px;
          padding: 4px 14px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-accent);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 1.25rem;
        }
        .privacy-badge-dot {
          width: 6px;
          height: 6px;
          background: var(--color-accent);
          border-radius: 50%;
        }
        .privacy-h1 {
          font-size: 3rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0 0 1rem 0;
          color: var(--color-text);
          line-height: 1.1;
        }
        .privacy-h1 span {
          color: var(--color-accent);
        }
        .privacy-subtitle {
          color: var(--color-text-muted);
          font-size: 1.1rem;
          line-height: 1.6;
          max-width: 480px;
          margin: 0 auto;
        }
        .privacy-tldr {
          background: linear-gradient(135deg, rgba(111,191,174,0.1) 0%, rgba(80,163,146,0.05) 100%);
          border: 1px solid rgba(111,191,174,0.3);
          border-radius: 16px;
          padding: 1.5rem 2rem;
          margin-bottom: 2.5rem;
        }
        .privacy-tldr-title {
          color: var(--color-text);
          font-weight: 700;
          font-size: 1.05rem;
          margin: 0 0 0.75rem 0;
        }
        .privacy-tldr-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .privacy-tldr-item {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--color-text-muted);
          font-size: 0.95rem;
        }
        .privacy-tldr-check {
          color: var(--color-accent);
          font-size: 1rem;
          flex-shrink: 0;
        }
        .privacy-sections {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .privacy-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 1.75rem 2rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .privacy-card:hover {
          border-color: rgba(111,191,174,0.4);
          box-shadow: 0 4px 32px -4px rgba(111,191,174,0.1);
          background: var(--color-surface-raised);
        }
        .privacy-card-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .privacy-card-icon {
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          background: rgba(111,191,174,0.1);
          border: 1px solid rgba(111,191,174,0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-accent);
          transition: background 0.2s ease;
        }
        .privacy-card:hover .privacy-card-icon {
          background: rgba(111,191,174,0.18);
        }
        .privacy-icon {
          width: 20px;
          height: 20px;
        }
        .privacy-card-meta {
          flex: 1;
        }
        .privacy-card-number {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--color-text-muted);
          display: block;
          margin-bottom: 3px;
        }
        .privacy-card-title {
          color: var(--color-text);
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
        }
        .privacy-card-body {
          color: var(--color-text-muted);
          line-height: 1.75;
          margin: 0 0 1.25rem 0;
          font-size: 0.975rem;
        }
        .privacy-card-highlight {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(111,191,174,0.07);
          border-left: 3px solid var(--color-accent);
          border-radius: 0 8px 8px 0;
          padding: 9px 14px;
          font-size: 0.875rem;
          color: var(--color-accent);
          font-weight: 500;
        }
        .privacy-footer-card {
          margin-top: 2.5rem;
          padding: 1.5rem 2rem;
          background: var(--color-surface-raised);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          text-align: center;
        }
        .privacy-footer-text {
          color: var(--color-text-muted);
          margin: 0 0 0.4rem 0;
          font-size: 0.9rem;
          line-height: 1.6;
        }
        .privacy-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(111,191,174,0.1);
          border: 1px solid rgba(111,191,174,0.3);
          border-radius: 10px;
          padding: 12px 28px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-accent);
          text-decoration: none;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
          margin-top: 2.5rem;
        }
        .privacy-back-btn:hover {
          background: rgba(111,191,174,0.18);
          border-color: rgba(111,191,174,0.5);
          color: var(--color-accent);
          transform: translateY(-1px);
        }
        .privacy-back-icon {
          width: 16px;
          height: 16px;
        }
        .privacy-cta {
          text-align: center;
        }

        @media (max-width: 640px) {
          .privacy-h1 { font-size: 2.25rem; }
          .privacy-card { padding: 1.25rem 1.25rem; }
          .privacy-tldr { padding: 1.25rem 1.25rem; }
        }
      `}</style>

      <div className="privacy-page">
        {/* Background glows */}
        <div aria-hidden="true" className="privacy-glow-top" />
        <div aria-hidden="true" className="privacy-glow-bottom" />

        <div className="privacy-container">
          {/* Header */}
          <header className="privacy-header">
            <div aria-hidden="true" className="privacy-orb animate-breathe" />
            <div className="privacy-badge">
              <span className="privacy-badge-dot" />
              Transparency First
            </div>
            <h1 className="privacy-h1">
              Privacy <span>Policy</span>
            </h1>
            <p className="privacy-subtitle">
              Your data is yours. Here is exactly how Stillpoint handles every
              byte — with nothing to hide.
            </p>
          </header>

          {/* TL;DR */}
          <div className="privacy-tldr">
            <p className="privacy-tldr-title">TL;DR</p>
            <ul className="privacy-tldr-list">
              {[
                "We never store your messages.",
                "Crisis checks are anonymous and ephemeral.",
                "Local mode sends absolutely nothing anywhere.",
                "Your account is never linked to your chat.",
              ].map((item) => (
                <li key={item} className="privacy-tldr-item">
                  <span className="privacy-tldr-check">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Section cards */}
          <div className="privacy-sections">
            {SECTIONS.map((section) => (
              <div key={section.number} className="privacy-card">
                <div className="privacy-card-header">
                  <div className="privacy-card-icon">{section.icon}</div>
                  <div className="privacy-card-meta">
                    <span className="privacy-card-number">{section.number}</span>
                    <h2 className="privacy-card-title">{section.title}</h2>
                  </div>
                </div>
                <p className="privacy-card-body">{section.body}</p>
                <div className="privacy-card-highlight">{section.highlight}</div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="privacy-footer-card">
            <p className="privacy-footer-text">
              Last updated August 2026. Questions about how your data is handled? Reach out.
            </p>
            <p className="privacy-footer-text" style={{ margin: 0 }}>
              Built with care for people in difficult moments.
            </p>
          </div>

          {/* Back CTA */}
          <div className="privacy-cta">
            <Link href="/app" className="privacy-back-btn">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="privacy-back-icon"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Return to Stillpoint
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
