/** "Ready to use" group: completed local downloads + connected remote APIs. */

import { useModelStore } from "../../store/modelStore";
import { useChatStore } from "../../store/chat";
import { activeGroupId, isProviderActive } from "../../lib/model-providers.ts";
import { ModelAccordion } from "./ModelAccordion.tsx";
import { ModelCard, RemoteProviderCard } from "./ModelCard.tsx";

export function ReadyModels({
  open,
  onToggle,
  onOpenSettings,
  onNavigateToChat,
  hfOnly = false,
}: {
  open: boolean;
  /** Receives the Collapsible's next state, not a bare toggle. */
  onToggle: (next: boolean) => void;
  onOpenSettings: (modelId: string) => void;
  /** Called after a model is activated, so the screen can jump to chat. */
  onNavigateToChat?: () => void;
  /** PocketPal `hf` filter: HuggingFace-origin downloads only, no remotes. */
  hfOnly?: boolean;
}) {
  const {
    models,
    remoteApis,
    remoteCaps,
    activeModelId,
    setActiveModel,
    setActiveRemoteApi,
    removeRemoteApi,
  } = useModelStore();
  // Unload must free memory, not just detach: point the model store at
  // nothing AND drop the engine's cached context so the next Load reloads.
  const releaseEngine = useChatStore((s) => s.releaseEngine);

  const downloaded = models.filter(
    (m) =>
      m.origin !== "remote_api" &&
      m.downloadStatus === "completed" &&
      (!hfOnly || m.origin === "huggingface"),
  );
  // Remote providers are not HuggingFace models: hidden by the hf filter.
  const remotes = hfOnly ? [] : remoteApis;
  // A "Ready to use (0)" header with nothing under it is dead UI, so an
  // empty group is not rendered at all — the same rule pocketpal uses
  // (`.filter(group => group.items.length > 0)`). This covers the filtered
  // case too: hfOnly/downloadedOnly can empty a group that has models.
  if (downloaded.length === 0 && remotes.length === 0) return null;

  return (
    <ModelAccordion
      title="Ready to use"
      count={downloaded.length + remotes.length}
      open={open}
      onToggle={onToggle}
      active={activeGroupId(activeModelId) === "ready"}
    >
      {downloaded.map((item) => (
        <ModelCard
          key={item.id}
          item={item}
          isActive={activeModelId === item.id}
          onActivate={() => {
            setActiveModel(item.id, "local");
            onNavigateToChat?.();
          }}
          onDeactivate={() => {
            setActiveModel(null);
            releaseEngine();
          }}
          onSettings={() => onOpenSettings(item.id)}
        />
      ))}

      {remotes.map((item) => (
        <RemoteProviderCard
          key={item.id}
          item={item}
          isActive={isProviderActive(activeModelId, item.id)}
          reachable={remoteCaps[item.id]?.reachable}
          onActivate={() => setActiveRemoteApi(item.id)}
          onRemove={() => removeRemoteApi(item.id)}
        />
      ))}
    </ModelAccordion>
  );
}
