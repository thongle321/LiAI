/** Every model the user could switch to, in ONE place.
 *
 * THREE surfaces offer this list: the header menu's "Model" submenu
 * (components/chat/chat-menu.tsx), each message's "Regenerate with…"
 * submenu, and the chat thread's model picker sheet
 * (components/chat/model-picker-sheet.tsx). They must never disagree about
 * which models exist or which is active, so no surface builds the list
 * itself.
 *
 * Local readiness is NOT decided here: `isLocalModelReady` is the engine's
 * predicate, shared so this list and the composer cannot classify the same
 * spec differently — they did, and the composer reported "Model not
 * loaded." under a header still naming the model.
 *
 * Pure, so it is node-testable without the model store or react-native.
 */

import { isLocalModelReady } from "../inference/engine.ts";
import type { ModelOrigin } from "../../types/models.ts";

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
  origin?: ModelOrigin;
  files?: ReadonlyArray<unknown>;
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
    isLocalModelReady(m)
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