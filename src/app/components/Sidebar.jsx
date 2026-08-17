"use client";

import { useRouter } from "next/navigation";
import ThreadList from "./ThreadList";
import SettingsPanels from "./SettingsPanels";

/**
 * Sidebar — persistent left navigation rail & mobile slide-over drawer.
 * Contains brand header, conversation history, Model settings, and user status.
 */
export default function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  user,
  localAISupported,
  localAIEnabled,
  selectedTier,
  downloadState,
  downloadProgress,
  downloadText,
  localAIStatus,
  localAIInferring,
  onEnableLocalAI,
  onDisableLocalAI,
  onSelectTier,
  onStartDownload,
  onCancelDownload,
  onCloseMobile,
}) {
  const router = useRouter();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface text-text">
      {/* Brand Header */}
      <div className="flex shrink-0 items-center justify-between p-4 border-b border-border/30">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-accent font-bold text-xs">
            S
          </span>
          <h1 className="text-base font-bold tracking-tight text-text m-0">Stillpoint</h1>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised md:hidden"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Thread History */}
      <div className="flex-1 min-h-0 overflow-y-auto py-3">
        <div className="px-3 pb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted/70">
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

      {/* Settings Panel & User Account Footer */}
      <div className="shrink-0 max-w-full overflow-hidden border-t border-border/30 bg-bg/30">
        <details className="group">
          <summary className="flex cursor-pointer items-center justify-between p-3.5 text-[0.85rem] font-medium text-text-muted hover:text-text select-none">
            <span className="flex items-center gap-2">
              <span>⚙️</span> Mode & Settings
            </span>
            <span className="text-xs transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="max-h-80 overflow-y-auto border-t border-border/20 bg-surface/50">
            <SettingsPanels
              embedded={true}
              user={user}
              localAISupported={localAISupported}
              localAIEnabled={localAIEnabled}
              selectedTier={selectedTier}
              downloadState={downloadState}
              downloadProgress={downloadProgress}
              downloadText={downloadText}
              localAIStatus={localAIStatus}
              localAIInferring={localAIInferring}
              onEnableLocalAI={onEnableLocalAI}
              onDisableLocalAI={onDisableLocalAI}
              onSelectTier={onSelectTier}
              onStartDownload={onStartDownload}
              onCancelDownload={onCancelDownload}
            />
          </div>
        </details>

        {/* User Account Menu */}
        <div className="flex items-center justify-between border-t border-border/30 p-3.5 text-[0.85rem]">
          {user ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                {user.email?.[0]?.toUpperCase() || "U"}
              </span>
              <span className="truncate font-medium text-text-muted">{user.email}</span>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between">
              <span className="text-text-muted text-xs">Not signed in</span>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-xs font-bold text-accent hover:underline"
              >
                Log in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
