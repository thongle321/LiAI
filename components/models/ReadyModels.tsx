/** "Ready to use" group: completed local downloads + connected remote APIs. */

import { useModelStore } from "../../store/modelStore";
import { isProviderActive } from "../../lib/model-providers.ts";
import { ModelAccordion } from "./ModelAccordion.tsx";
import { ModelCard, RemoteProviderCard } from "./ModelCard.tsx";

export function ReadyModels({
  open,
  onToggle,
  onOpenSettings,
}: {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: (modelId: string) => void;
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

  const downloaded = models.filter(
    (m) => m.origin !== "remote_api" && m.downloadStatus === "completed",
  );

  return (
    <ModelAccordion
      title="Ready to use"
      count={downloaded.length + remoteApis.length}
      open={open}
      onToggle={onToggle}
    >
      {downloaded.map((item) => (
        <ModelCard
          key={item.id}
          item={item}
          isActive={activeModelId === item.id}
          onActivate={() => setActiveModel(item.id, "local")}
          onSettings={() => onOpenSettings(item.id)}
        />
      ))}

      {remoteApis.map((item) => (
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
