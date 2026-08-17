"use client";

import { useState } from "react";
import { useStillpoint } from "@/hooks/useStillpoint";
import ChatShell from "../components/ChatShell";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";
import AuthRequiredModal from "../components/AuthRequiredModal";

/**
 * AppPage — The Stillpoint chat application at /app.
 * Assembles ChatShell layout with Sidebar navigation, central MessageList,
 * TopBar controls, Composer input, and AuthRequiredModal.
 */
export default function AppPage() {
  const { state, actions } = useStillpoint();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const activeThread = state.threads.find((t) => t.id === state.activeThreadId);

  return (
    <ChatShell
      sidebarOpen={mobileSidebarOpen}
      onCloseSidebar={() => setMobileSidebarOpen(false)}
      sidebar={
        <Sidebar
          threads={state.threads}
          activeThreadId={state.activeThreadId}
          onSelectThread={actions.selectThread}
          onDeleteThread={actions.deleteThread}
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
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
      }
    >
      <TopBar
        activeThreadTitle={activeThread?.title}
        onUpdateTitle={(newTitle) => {
          if (state.activeThreadId) {
            actions.updateThreadTitle(state.activeThreadId, newTitle);
          }
        }}
        localAIEnabled={state.localAIEnabled}
        selectedTier={state.selectedTier}
        onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
      />

      <MessageList
        messages={state.messages}
        status={state.status}
        error={state.error}
        localAIInferring={state.localAIInferring}
        crisisRegion={state.crisisRegion}
        onChooseCrisisRegion={actions.chooseCrisisRegion}
      />

      <Composer
        onSubmit={actions.submit}
        disabled={state.localAIInferring || state.downloadState === "downloading"}
        localAIEnabled={state.localAIEnabled}
        selectedTier={state.selectedTier}
      />

      <AuthRequiredModal
        open={state.authRequiredOpen}
        mode={state.authRequiredMode}
        localAISupported={state.localAISupported}
        localAIReady={state.localAIReady}
        onEnableLocalAI={actions.enableLocalAI}
        onClose={actions.closeAuthRequired}
      />
    </ChatShell>
  );
}
