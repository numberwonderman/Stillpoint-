"use client";

import { useStillpoint } from "@/hooks/useStillpoint";
import SiteFrame from "../components/SiteFrame";
import SettingsPanels from "../components/SettingsPanels";
import InputSection from "../components/InputSection";
import ResponseSection from "../components/ResponseSection";

/**
 * The Stillpoint tool itself, at /app. Wires the orchestration hook to the
 * four presentational components. No rendering logic of its own — just
 * passes state/actions through.
 */
export default function AppPage() {
  const { state, actions } = useStillpoint();

  return (
    <SiteFrame>
      <SettingsPanels
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
      />
      <InputSection onSubmit={actions.submit} />
      <ResponseSection
        status={state.status}
        error={state.error}
        crisis={state.crisis}
        crisisSeverity={state.crisisSeverity}
        response={state.response}
        localAIInferring={state.localAIInferring}
        localAIStopped={state.localAIStopped}
        crisisRegion={state.crisisRegion}
        onChooseCrisisRegion={actions.chooseCrisisRegion}
      />
    </SiteFrame>
  );
}
