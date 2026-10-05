/** Every model the user could switch to, in ONE place.
 *
 * Two surfaces offer this list: the header menu's "Model" submenu
 * (components/chat/ChatMenu.tsx) and each message's "Regenerate with…"
 * submenu. They must never disagree about which models exist or which is
 * active, so neither builds the list itself.
 *
 * Pure, so it is node-testable without the model store or react-native.
 */

/** A selectable model. `host` is present only for remote entries, and is
 *  what tells two servers offering the same model name apart. */
export interface PickableModel {
  id: string;
  name: string;
  host?: string;
  active: boolean;
}

interface DownloadLike {
  id: string;
  name: string;
  downloadStatus: string;
}

interface RemoteLike {
  id: string;
  name: string;
  baseUrl: string;
}

/** Host of a remote's baseUrl, so the label reads `qwen (my-server)`.
 *  Falls back to the raw string when the URL does not parse — a label is
 *  not worth failing a menu over. */
export function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function pickableModels(
  models: DownloadLike[],
  remoteApis: RemoteLike[],
  activeModelId: string | null,
): PickableModel[] {
  const local: PickableModel[] = models.flatMap((m) =>
    m.downloadStatus === "completed"
      ? [{ id: m.id, name: m.name, active: m.id === activeModelId }]
      : [],
  );
  const remote: PickableModel[] = remoteApis.map((p) => ({
    id: p.id,
    name: p.name,
    host: providerHost(p.baseUrl),
    active: p.id === activeModelId,
  }));
  return [...local, ...remote];
}