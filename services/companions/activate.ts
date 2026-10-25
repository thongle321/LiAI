/** Companion → model activation rules (PocketPal's activatePal.ts, minus the
 *  navigation/Alert side effects — those stay in the screen).
 *
 *  Pure: takes the catalog as data so the rules are node-testable. A companion
 *  RECOMMENDS a model; it never hard-pins one, so every failure to find
 *  it degrades to "keep chatting with whatever is active".
 */

import type { CompanionModelRef } from "@/types/companion.ts";
import type { ModelSpec } from "@/types/models.ts";

export type CompanionModelAction =
  /** Nothing to do: no recommendation, or it is not downloaded. */
  | { kind: "none" }
  /** Select this model now — nothing else is active. */
  | { kind: "select"; model: ModelSpec }
  /** A DIFFERENT model is active: ask before switching. */
  | { kind: "ask"; model: ModelSpec };

export const isDownloaded = (spec: ModelSpec): boolean =>
  spec.downloadStatus === "completed";

export function downloadedSpecs(models: readonly ModelSpec[]): ModelSpec[] {
  return models.filter(isDownloaded);
}

/** The one readiness test for a companion's recommended model (PocketPal's
 *  `modelStore.isModelAvailable`): present in the catalog AND downloaded.
 *  The card's warning pill and the activation flow must never disagree, so
 *  both read THIS file's rule and never re-derive it inline. */
export function isModelReady(
  id: string | undefined,
  models: readonly ModelSpec[],
): boolean {
  return id !== undefined && models.some((m) => m.id === id && isDownloaded(m));
}

/** What activating a companion implies for the loaded model.
 *
 *  Downloaded-only lookup, exactly like PocketPal's availableModels
 *  filter: a recommendation the phone cannot run is shown in the editor
 *  with a download CTA, never auto-downloaded from a Use tap. */
export function resolveCompanionModelAction(
  recommendation: CompanionModelRef | undefined,
  downloaded: ModelSpec[],
  activeModelId: string | null,
): CompanionModelAction {
  if (!recommendation) return { kind: "none" };
  const model = downloaded.find((m) => m.id === recommendation.id);
  if (!model) return { kind: "none" };
  if (activeModelId === null) return { kind: "select", model };
  if (model.id === activeModelId) return { kind: "none" };
  return { kind: "ask", model };
}
