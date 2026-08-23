"use client";

import { useEffect, useRef, useState } from "react";

export default function SpeechPlayer({
  text,
  supported,
  speaking,
  paused,
  voices,
  rate,
  pitch,
  voiceURI,
  onChangeRate,
  onChangePitch,
  onChangeVoice,
  speak,
  pause,
  resume,
  cancel,
  backend = "browser",
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popoverPlacement, setPopoverPlacement] = useState("up"); // "up" | "down"
  const settingsRef = useRef(null);

  function handleToggleSettings() {
    if (!settingsOpen && settingsRef.current) {
      const rect = settingsRef.current.getBoundingClientRect();
      // If button is near top of viewport (< 280px), pop down; otherwise pop up
      if (rect.top < 280) {
        setPopoverPlacement("down");
      } else {
        setPopoverPlacement("up");
      }
    }
    setSettingsOpen((prev) => !prev);
  }

  // Close the settings popover on outside click / Escape.
  useEffect(() => {
    if (!settingsOpen) return;
    function onDown(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  if (!text) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 text-xs">
        {!supported && (
          <span className="text-text-muted/70 italic">
            Read-aloud not supported in this browser
          </span>
        )}
        {supported && !speaking && (
          <button
            type="button"
            onClick={() => speak(text)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-surface-raised/60 px-2.5 py-1 font-semibold text-text-muted hover:text-accent hover:border-accent/40 transition-colors"
            aria-label="Listen to this message"
            title="Listen"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z" />
            </svg>
            Listen
          </button>
        )}

        {supported && speaking && !paused && (
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 font-semibold text-accent hover:bg-accent/25 transition-colors"
            aria-label="Pause reading"
            title="Pause"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
            Pause
          </button>
        )}

        {supported && speaking && paused && (
          <button
            type="button"
            onClick={resume}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/15 px-2.5 py-1 font-semibold text-accent hover:bg-accent/25 transition-colors"
            aria-label="Resume reading"
            title="Resume"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
        )}

        {supported && speaking && (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-surface-raised/60 px-2.5 py-1 font-semibold text-text-muted hover:text-crisis hover:border-crisis/40 transition-colors"
            aria-label="Stop reading"
            title="Stop"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
            Stop
          </button>
        )}

        {supported && (
          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={handleToggleSettings}
              aria-label="Voice settings"
              aria-expanded={settingsOpen}
              title="Voice settings"
              className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border transition-colors ${
                settingsOpen
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border/40 bg-surface-raised/60 text-text-muted hover:text-accent hover:border-accent/40"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {settingsOpen && (
              <div
                role="dialog"
                aria-label="Voice settings"
                className={`absolute right-0 w-[min(16rem,calc(100vw-2.5rem))] max-h-[min(80vh,22rem)] overflow-y-auto rounded-xl border border-border/60 bg-surface/98 p-3 shadow-2xl backdrop-blur-xl z-50 animate-modal-pop ${
                  popoverPlacement === "down" ? "top-full mt-2" : "bottom-full mb-2"
                }`}
              >
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="tts-rate" className="text-[0.72rem] font-semibold text-text-muted">
                      Speed (Rate)
                    </label>
                    <span className="text-[0.7rem] font-mono font-bold text-accent">
                      {rate.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    id="tts-rate"
                    type="range"
                    min="0.75"
                    max="2.5"
                    step="0.05"
                    value={rate}
                    onChange={(e) => onChangeRate?.(parseFloat(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[0.65rem] text-text-muted/60 mt-0.5 font-mono">
                    <span>0.75×</span>
                    <span>1.05×</span>
                    <span>2.5×</span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="tts-pitch"
                      className={`text-[0.72rem] font-semibold ${
                        backend === "kokoro-stream"
                          ? "text-text-muted/40"
                          : "text-text-muted"
                      }`}
                    >
                      Pitch
                    </label>
                    <span
                      className={`text-[0.7rem] font-mono ${
                        backend === "kokoro-stream"
                          ? "text-text-muted/40"
                          : "text-text-muted/80"
                      }`}
                    >
                      {pitch.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="tts-pitch"
                    type="range"
                    min="0.5"
                    max="1.75"
                    step="0.05"
                    value={pitch}
                    disabled={backend === "kokoro-stream"}
                    onChange={(e) => onChangePitch?.(parseFloat(e.target.value))}
                    className={`w-full accent-accent ${
                      backend === "kokoro-stream"
                        ? "cursor-not-allowed opacity-40"
                        : "cursor-pointer"
                    }`}
                  />
                  {backend === "kokoro-stream" && (
                    <p className="mt-0.5 text-[0.65rem] leading-snug text-text-muted/60 italic">
                      Pitch is fixed by the Kokoro voice.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="tts-voice" className="mb-1 block text-[0.72rem] font-semibold text-text-muted">
                    Voice
                  </label>
                  <select
                    id="tts-voice"
                    value={voiceURI || ""}
                    onChange={(e) => onChangeVoice?.(e.target.value || undefined)}
                    className="w-full rounded-lg border border-border/60 bg-bg/80 px-2 py-1.5 text-xs text-text focus:outline-none focus:border-accent/60"
                  >
                    <option value="">System default</option>
                    {(voices || []).map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>

                {speaking && (
                  <p className="mt-2 text-[0.68rem] leading-snug text-text-muted/70 italic">
                    Changes apply next listen.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {speaking && (
          <span className="ml-1 inline-flex items-center gap-1 text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[0.7rem]">Reading…</span>
            <span className="text-[0.65rem] uppercase tracking-wider font-bold border border-border/40 rounded px-1.5 py-[1px] text-text-muted/70">
              {backend === "kokoro-stream" ? "Kokoro" : "Browser"}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
