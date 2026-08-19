"use client";

/**
 * ResourceCard — A polished card for a NOPE Signpost resource.
 *
 * Supports:
 *  - Open website
 *  - Call (tel: link)
 *  - View in Maps (Apple Maps on Apple devices, Google Maps elsewhere)
 *  - Crisis badge when isCrisis: true
 */

function getMapsUrl(address) {
  if (!address) return null;
  const encoded = encodeURIComponent(address);
  // Detect Apple platform
  if (
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) &&
    navigator.maxTouchPoints > 0
  ) {
    return `https://maps.apple.com/?q=${encoded}`;
  }
  return `https://maps.google.com/?q=${encoded}`;
}

export default function ResourceCard({ resource }) {
  const { name, description, why, phone, url, address, availability, isCrisis } = resource;
  const mapsUrl = getMapsUrl(address);

  const hasActions = url || phone || mapsUrl;

  return (
    <div
      className={`resource-card relative overflow-hidden rounded-[14px] border transition-all duration-200 ${
        isCrisis
          ? "border-crisis/50 bg-crisis-bg shadow-[0_4px_20px_-4px_rgba(245,160,122,0.15)]"
          : "border-border/60 bg-surface shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]"
      }`}
    >
      {/* Crisis indicator strip */}
      {isCrisis && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-crisis/70 via-crisis to-crisis/70"
        />
      )}

      <div className={`px-4 py-4 sm:px-5 ${isCrisis ? "pt-5" : ""}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            {isCrisis && (
              <span className="inline-flex items-center gap-1 mb-1.5 rounded-full bg-crisis/15 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-widest text-crisis">
                <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-crisis animate-pulse" />
                Crisis support
              </span>
            )}
            <h4 className={`font-bold leading-snug truncate ${isCrisis ? "text-[1rem] text-text" : "text-[0.975rem] text-accent"}`}>
              {name}
            </h4>
          </div>
        </div>

        {/* Why this resource is relevant */}
        {why && (
          <p className="mb-2 text-[0.875rem] leading-relaxed text-text/90 italic">
            {why}
          </p>
        )}

        {/* Description */}
        {description && !why && (
          <p className="mb-2 text-[0.875rem] leading-relaxed text-text-muted">
            {description}
          </p>
        )}

        {/* Availability */}
        {availability && (
          <p className="mb-3 text-[0.8rem] font-medium text-text-muted/70 uppercase tracking-wide">
            {availability}
          </p>
        )}

        {/* Address line */}
        {address && (
          <p className="mb-3 flex items-start gap-1.5 text-[0.85rem] text-text-muted">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[0.95em]">📍</span>
            <span>{address}</span>
          </p>
        )}

        {/* Action buttons */}
        {hasActions && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/30">
            {/* Call */}
            {phone && (
              <a
                href={`tel:${phone.replace(/\D/g, "")}`}
                className={`resource-action inline-flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[0.875rem] font-semibold transition-all ${
                  isCrisis
                    ? "bg-crisis text-bg hover:bg-crisis-strong"
                    : "bg-accent/15 text-accent hover:bg-accent/25 border border-accent/25"
                }`}
              >
                <span aria-hidden="true">📞</span>
                Call {phone}
              </a>
            )}

            {/* Open website */}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="resource-action inline-flex items-center gap-1.5 rounded-[8px] border border-border/60 bg-surface-raised px-3 py-2 text-[0.875rem] font-semibold text-text-muted hover:border-accent/40 hover:text-accent transition-all"
              >
                <span aria-hidden="true">↗</span>
                Open website
              </a>
            )}

            {/* Maps */}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="resource-action inline-flex items-center gap-1.5 rounded-[8px] border border-border/60 bg-surface-raised px-3 py-2 text-[0.875rem] font-semibold text-text-muted hover:border-accent/40 hover:text-accent transition-all"
              >
                <span aria-hidden="true">🗺</span>
                View in Maps
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
