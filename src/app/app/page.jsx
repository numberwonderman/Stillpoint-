"use client";

import { useState } from "react";
import { useStillpoint } from "@/hooks/useStillpoint";
import ChatShell from "../components/ChatShell";
import Sidebar from "../components/Sidebar";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";
import AuthRequiredModal from "../components/AuthRequiredModal";
import ModelSelectionModal from "../components/ModelSelectionModal";
import Toast from "../components/Toast";

/**
 * AppPage — Main chat workspace.
 * Clean, distraction-free layout (TopBar removed) with collapsible sidebar,
 * top-left toggle, centered ModelSelectionModal, central MessageList, and Composer.
 */
export default function AppPage() {
  const { state, actions } = useStillpoint();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);

  return (
    <ChatShell
      sidebarOpen={mobileSidebarOpen}
      isCollapsed={desktopSidebarCollapsed}
      onCloseSidebar={() => setMobileSidebarOpen(false)}
      sidebar={
        <Sidebar
          threads={state.threads}
          activeThreadId={state.activeThreadId}
          onSelectThread={actions.selectThread}
          onDeleteThread={actions.deleteThread}
          onNewThread={actions.newThread}
          user={state.user}
          localAIEnabled={state.localAIEnabled}
          selectedTier={state.selectedTier}
          storageMode={state.storageMode}
          onSetStorageMode={actions.setStorageMode}
          onClearAllThreads={actions.clearAllThreads}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          isCollapsed={desktopSidebarCollapsed}
          onToggleCollapse={() => setDesktopSidebarCollapsed((prev) => !prev)}
          onOpenModelModal={() => setModelModalOpen(true)}
        />
      }
    >
      {/* Floating Toggle Button for Mobile and Collapsed Desktop */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        {desktopSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setDesktopSidebarCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl bg-surface/90 border border-border/60 text-text-muted hover:text-text hover:bg-surface-raised transition-all backdrop-blur-md shadow-md"
          >
            ☰
          </button>
        )}

        {/* Mobile menu trigger when sidebar is hidden on small screens */}
        {!mobileSidebarOpen && (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            title="Open menu"
            className="flex md:hidden h-9 w-9 items-center justify-center rounded-xl bg-surface/90 border border-border/60 text-text-muted hover:text-text hover:bg-surface-raised transition-all backdrop-blur-md shadow-md"
          >
            ☰
          </button>
        )}
      </div>

      {/* Main Chat Scroll View */}
      <MessageList
        messages={state.messages}
        status={state.status}
        error={state.error}
        localAIInferring={state.localAIInferring}
        localAIStatus={state.localAIStatus}
        downloadProgress={state.downloadProgress}
        downloadText={state.downloadText}
        crisisRegion={state.crisisRegion}
        onChooseCrisisRegion={actions.chooseCrisisRegion}
        onReply={actions.submit}
      />

      {/* Bottom Composer Bar */}
      <Composer
        onSubmit={actions.submit}
        onStopGeneration={actions.stopGeneration}
        isGenerating={state.isGenerating || state.localAIInferring}
        isDownloading={state.downloadState === "downloading"}
        localAIEnabled={state.localAIEnabled}
        selectedTier={state.selectedTier}
        downloadState={state.downloadState}
        readyModelKey={state.readyModelKey}
        onOpenModelModal={() => setModelModalOpen(true)}
        onEnableLocalAI={actions.enableLocalAI}
        onDisableLocalAI={actions.disableLocalAI}
        onSelectTier={actions.setSelectedTier}
      />

      {/* Centered Backdrop-Blurred Model Selection Modal */}
      <ModelSelectionModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        user={state.user}
        localAISupported={state.localAISupported}
        localAIEnabled={state.localAIEnabled}
        selectedTier={state.selectedTier}
        downloadState={state.downloadState}
        downloadProgress={state.downloadProgress}
        downloadText={state.downloadText}
        localAIStatus={state.localAIStatus}
        localAIInferring={state.localAIInferring}
        onEnableLocalAI={actions.enableLocalAI}
        onDisableLocalAI={actions.disableLocalAI}
        onSelectTier={actions.setSelectedTier}
        onStartDownload={actions.startDownload}
        onCancelDownload={actions.cancelDownload}
        storageMode={state.storageMode}
        onSetStorageMode={actions.setStorageMode}
        onClearAllThreads={actions.clearAllThreads}
      />

      {/* Auth Gating Modal */}
      <AuthRequiredModal
        open={state.authRequiredOpen}
        mode={state.authRequiredMode}
        localAISupported={state.localAISupported}
        localAIReady={state.localAIReady}
        onEnableLocalAI={actions.enableLocalAI}
        onClose={actions.closeAuthRequired}
      />

      {/* Storage Migration Toast */}
      {state.storageMigrationToast && (
        <Toast
          message={state.storageMigrationToast}
          variant="info"
          onDismiss={actions.dismissStorageToast}
        />
      )}
    </ChatShell>
  );
}
