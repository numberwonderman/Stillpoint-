"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown — renders AI-sent markdown with GitHub-flavored extensions
 * (tables, strikethrough, task lists, autolinks).
 *
 * `className` is applied to the wrapper; markdown children render inside.
 * `streaming` adds a trailing caret span (matching the existing
 * `.streaming-caret` style used by plain-text bubbles).
 *
 * The component map keeps every element inside the bubble's own
 * `text-text` palette so we don't depend on `@tailwindcss/typography`
 * (not installed) and we stay consistent with the existing surface
 * tokens (--color-text, --color-text-muted, --color-accent, --color-border).
 */
export default function Markdown({ children, className = "", streaming = false }) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="md-h1" {...props} />,
          h2: (props) => <h2 className="md-h2" {...props} />,
          h3: (props) => <h3 className="md-h3" {...props} />,
          h4: (props) => <h4 className="md-h4" {...props} />,
          p: (props) => <p className="md-p" {...props} />,
          ul: (props) => <ul className="md-ul" {...props} />,
          ol: (props) => <ol className="md-ol" {...props} />,
          li: (props) => <li className="md-li" {...props} />,
          a: ({ href, ...rest }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              className="md-a"
              {...rest}
            />
          ),
          blockquote: (props) => <blockquote className="md-blockquote" {...props} />,
          code: ({ inline, className: cls, children, ...rest }) =>
            inline ? (
              <code className="md-code-inline" {...rest}>
                {children}
              </code>
            ) : (
              <code className={`md-code-block ${cls || ""}`} {...rest}>
                {children}
              </code>
            ),
          pre: (props) => <pre className="md-pre" {...props} />,
          hr: (props) => <hr className="md-hr" {...props} />,
          table: (props) => <table className="md-table" {...props} />,
          thead: (props) => <thead className="md-thead" {...props} />,
          tbody: (props) => <tbody className="md-tbody" {...props} />,
          tr: (props) => <tr className="md-tr" {...props} />,
          th: (props) => <th className="md-th" {...props} />,
          td: (props) => <td className="md-td" {...props} />,
          strong: (props) => <strong className="md-strong" {...props} />,
          em: (props) => <em className="md-em" {...props} />,
          del: (props) => <del className="md-del" {...props} />,
        }}
      >
        {children || ""}
      </ReactMarkdown>
      {streaming && <span aria-hidden="true" className="streaming-caret" />}
    </div>
  );
}
