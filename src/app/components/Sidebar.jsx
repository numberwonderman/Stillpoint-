"use client";

import { useRouter } from "next/navigation";
import ThreadList from "./ThreadList";

/**
 * Sidebar — Left navigation panel with collapsible support.
 * Features: Brand header, New Chat button, Conversation list, Model selection modal trigger, and User Account with Log out button.
 */
export default function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  onNewThread,
  user,
  localAIEnabled,
  selectedTier,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  onOpenModelModal,
}) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/");
    router.refresh();
  }

  // Collapsed Sidebar View (Icon-only Rail for Desktop)
  if (isCollapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-between py-4 bg-surface text-text border-r border-border/40 select-none">
        {/* Top: Logo & Expand Button */}
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-raised text-text-muted hover:text-text hover:bg-accent/20 hover:border-accent/40 border border-transparent transition-all"
          >
            <span className="text-sm">➔</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onNewThread();
              if (onCloseMobile) onCloseMobile();
            }}
            title="New Chat"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-bg font-bold shadow-md hover:bg-accent-strong transition-all"
          >
            +
          </button>
        </div>

        {/* Middle: Model Modal Launcher Icon */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onOpenModelModal}
            title={localAIEnabled ? `Local AI (${selectedTier || "medium"})` : "Cloud Mode"}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised border border-border/60 text-text-muted hover:text-accent hover:border-accent/40 transition-all text-lg"
          >
            {localAIEnabled ? "💻" : "☁️"}
          </button>
        </div>

        {/* Bottom: User Avatar / Logout */}
        <div className="flex flex-col items-center gap-3">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              title={`Log out (${user.email})`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-xs hover:bg-crisis/20 hover:text-crisis transition-colors"
            >
              {user.email?.[0]?.toUpperCase() || "U"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/login")}
              title="Log in"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-text-muted hover:text-accent transition-colors text-xs font-bold"
            >
              🔑
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded Sidebar View
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface text-text">
      {/* Brand Header & Collapse Controls */}
      <div className="flex shrink-0 items-center justify-between p-4 border-b border-border/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent font-bold text-xs">
            S
          </span>
          <h1 className="text-base font-bold tracking-tight text-text m-0 truncate">Stillpoint</h1>
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop collapse toggle */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-raised hover:text-text transition-colors"
            >
              ❮
            </button>
          )}

          {/* Mobile close toggle */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-raised hover:text-text transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* New Chat Button */}
      <div className="p-3 pb-1">
        <button
          type="button"
          onClick={() => {
            onNewThread();
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-bg transition-all hover:bg-accent-strong hover:text-text shadow-sm"
        >
          <span className="text-lg leading-none">+</span>
          <span>New conversation</span>
        </button>
      </div>

      {/* Scrollable Thread History */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        <div className="px-3.5 pb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted/70">
          Conversations
        </div>
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={(id) => {
            onSelectThread(id);
            if (onCloseMobile) onCloseMobile();
          }}
          onDeleteThread={onDeleteThread}
        />
      </div>

      {/* Bottom Footer Section: Model Modal Launcher & Account / Logout */}
      <div className="shrink-0 max-w-full overflow-hidden border-t border-border/30 bg-bg/40 p-3 space-y-2">
        {/* Model Selection Launcher */}
        <button
          type="button"
          onClick={onOpenModelModal}
          className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-surface/70 px-3.5 py-2.5 text-xs font-medium text-text-muted hover:text-text hover:bg-surface-raised hover:border-accent/40 transition-all"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="text-sm">{localAIEnabled ? "💻" : "☁️"}</span>
            <span className="truncate font-semibold text-text">
              {localAIEnabled ? `Local AI (${selectedTier || "medium"})` : "Cloud Mode (Gemini)"}
            </span>
          </div>
          <span className="text-xs text-accent font-semibold ml-2 shrink-0">Change</span>
        </button>

        {/* User Account & Bottom-Left Logout Button */}
        <div className="flex items-center justify-between rounded-xl border border-border/30 bg-surface/50 p-2.5 text-xs">
          {user ? (
            <div className="flex w-full items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {user.email?.[0]?.toUpperCase() || "U"}
                </span>
                <span className="truncate font-medium text-text-muted" title={user.email}>
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Log out of your account"
                className="shrink-0 rounded-lg border border-border/60 bg-surface-raised px-2.5 py-1 text-xs font-bold text-text-muted hover:border-crisis hover:text-crisis transition-colors flex items-center gap-1"
              >
                <span>Log out</span>
                <span className="text-[0.7rem]">↪</span>
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between">
              <span className="text-text-muted text-xs">Not signed in</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="text-xs font-bold text-accent hover:underline"
                >
                  Log in
                </button>
                <span className="text-text-muted/40">·</span>
                <button
                  type="button"
                  onClick={() => router.push("/signup")}
                  className="text-xs font-bold text-text hover:underline"
                >
                  Sign up
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
