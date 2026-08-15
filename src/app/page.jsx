"use client";

import { useStillpoint } from "@/hooks/useStillpoint";
import SiteFrame from "./components/SiteFrame";
import SettingsPanels from "./components/SettingsPanels";
import InputSection from "./components/InputSection";
import ResponseSection from "./components/ResponseSection";

/**
 * Top-level page. Wires the orchestration hook to the four presentational
 * components. No rendering logic of its own — just passes state/actions
 * through.
 */
export default function Page() {
  const { state, actions } = useStillpoint();

  return (
    <SiteFrame>
      <SettingsPanels
        localAISupported={state.localAISupported}
        onSaveKey={actions.setApiKey}
        onClearKey={actions.clearApiKey}
        onToggleLocalAI={actions.setLocalAIMode}
      />
      <InputSection onSubmit={actions.submit} />
      <ResponseSection
        status={state.status}
        error={state.error}
        crisis={state.crisis}
        response={state.response}
      />
    </SiteFrame>
  );
}
