/** Models-screen grouping, copied from PocketPal's ModelsScreen
 * (ModelsScreen.tsx:275-384, UIStore.ts:20-32).
 *
 * Two shapes, chosen by the `grouped` filter:
 * - off: two fixed buckets, `ready_to_use` ("Ready to Use") and
 *   `available_to_download` ("Available to Download"), the latter carrying
 *   the description "Use + button to find more models".
 * - on: one group per model type — "Local" for a local model, the type
 *   otherwise, "Unknown" when there is none — and no description.
 *
 * Empty groups are dropped, never rendered as a "Ready to Use (0)" header.
 *
 * A preset's spec row never appears while its preset card does — the card
 * carries that model's progress, quantizations and cancel, so both would
 * show one model twice.
 *
 * Divergence: PocketPal sorts downloaded-first when `grouped` is OFF
 * (:280-289). Our two buckets already split on downloaded/available, so
 * the sort would be a no-op — the items in a bucket are all one or the
 * other. Not implemented.
 */

import type { ModelSpec, PresetModel } from "../../types/models";
import type { RemoteApiProvider } from "../../types/models";
import { presetSpecId } from "./huggingface.ts";
import { isPresetDownloaded } from "./file-state.ts";

export const READY_TO_USE = "ready_to_use";
export const AVAILABLE_TO_DOWNLOAD = "available_to_download";
/** en.json `models.labels.localModel` / `unknownGroup`. */
export const LOCAL_GROUP = "Local";
export const UNKNOWN_GROUP = "Unknown";

export type ModelGroupItem =
  /** A spec in the store: a completed download, or an HF bookmark. */
  | { kind: "spec"; id: string }
  /** A connected remote provider. Never a download. */
  | { kind: "remote"; id: string }
  /** A catalog preset that is not on disk yet. */
  | { kind: "preset"; id: string };

export interface ModelGroup {
  /** The persisted expansion key — a group type, not the display label. */
  key: string;
  label: string;
  /** Shown under the header; only the Available-to-Download bucket has one. */
  description?: string;
  items: ModelGroupItem[];
}

export interface ModelGroupFilters {
  /** PocketPal `downloaded`: hide everything that is not downloaded. */
  downloadedOnly: boolean;
  /** PocketPal `hf`: Hugging Face models only, no remote providers. */
  hfOnly: boolean;
  /** PocketPal `grouped`: group by model type instead of the two buckets. */
  grouped: boolean;
}

export function buildModelGroups({
  specs,
  remotes,
  presets,
  filters,
}: {
  specs: ModelSpec[];
  remotes: RemoteApiProvider[];
  presets: PresetModel[];
  filters: ModelGroupFilters;
}): ModelGroup[] {
  // PocketPal filters the whole list first, then groups it (:275-333).
  let visibleSpecs = specs.filter(
    (s) => s.origin !== "remote_api" && (!filters.hfOnly || s.origin === "huggingface"),
  );
  // Catalog presets are all HF-repo-backed, so `hf` never removes one; the
  // `downloaded` filter does, because a preset on disk lives in Ready.
  let visiblePresets = filters.downloadedOnly
    ? []
    : presets.filter((p) => !isPresetDownloaded(specs, p));
  const visibleRemotes = filters.hfOnly || filters.downloadedOnly ? [] : remotes;

  if (filters.downloadedOnly) {
    visibleSpecs = visibleSpecs.filter((s) => s.downloadStatus === "completed");
  }

  // A preset's spec row IS its preset card: the card reads progress,
  // quantizations and Cancel off that very row. While the card is in
  // Available, rendering the row too lists the same model twice — so the
  // row only earns a card once the preset has fully left Available and the
  // completed model has to be shown from Ready.
  const coveredByPresetCard = new Set(
    visiblePresets.flatMap((p) => p.files.map((f) => presetSpecId(p.id, f.name))),
  );
  visibleSpecs = visibleSpecs.filter((s) => !coveredByPresetCard.has(s.id));

  const items: ModelGroupItem[] = [
    ...visibleSpecs.map((s): ModelGroupItem => ({ kind: "spec", id: s.id })),
    ...visibleRemotes.map((r): ModelGroupItem => ({ kind: "remote", id: r.id })),
    ...visiblePresets.map((p): ModelGroupItem => ({ kind: "preset", id: p.id })),
  ];

  if (!filters.grouped) {
    const ready: ModelGroupItem[] = [];
    const available: ModelGroupItem[] = [];
    for (const item of items) {
      if (item.kind === "preset") {
        available.push(item);
        continue;
      }
      if (item.kind === "remote") {
        ready.push(item);
        continue;
      }
      const spec = specs.find((s) => s.id === item.id);
      (spec?.downloadStatus === "completed" ? ready : available).push(item);
    }
    return [
      { key: READY_TO_USE, label: "Ready to Use", items: ready },
      {
        key: AVAILABLE_TO_DOWNLOAD,
        label: "Available to Download",
        description: "Use + button to find more models",
        items: available,
      },
    ].filter((g) => g.items.length > 0);
  }

  const byKey = new Map<string, ModelGroupItem[]>();
  const specById = new Map(specs.map((s) => [s.id, s]));
  const presetById = new Map(presets.map((p) => [p.id, p]));
  for (const item of items) {
    byKey.set(groupKey(item), [...(byKey.get(groupKey(item)) ?? []), item]);
  }
  // Grouped mode shows the raw key, not the display label (:348-350) — and
  // the key IS the label here, so one string serves both.
  return [...byKey.entries()].map(([key, groupItems]) => ({
    key,
    label: key,
    items: groupItems,
  }));

  function groupKey(item: ModelGroupItem): string {
    if (item.kind === "remote") return UNKNOWN_GROUP;
    const spec = specById.get(item.id);
    if (item.kind === "spec") {
      // PocketPal: local models get their own bucket whatever their type
      // (:320-322).
      return spec === undefined || spec.origin !== "local"
        ? (spec?.type ?? UNKNOWN_GROUP)
        : LOCAL_GROUP;
    }
    return presetById.get(item.id)?.type ?? UNKNOWN_GROUP;
  }
}

/** ONE row of the models screen's FlatList: a group header, or one of the
 * cards inside it.
 *
 * THE VIRTUALIZATION ANSWER. The screen used to hand the FlatList the
 * GROUPS and let each accordion render every one of its cards, so an
 * expanded group mounted its whole catalog. Nothing outside the viewport
 * was windowed, and every card subscribed to the whole `models` array — so
 * one download's progress tick re-rendered every card in every open group,
 * cost growing with the catalog.
 *
 * Flattening headers and cards into a single row list puts ONE virtualizer
 * over the whole screen: no nested scroller, no second orientation to
 * reconcile, and the mounted set is the viewport plus an overscan. A
 * collapsed group's cards are simply not rows, so they cost nothing.
 * Nesting a VirtualizedList per group was the other option and is worse:
 * React Native warns against it explicitly, same-orientation scrollers
 * fight each other, and it fixes the mounting problem without the
 * re-render one. */
export type ModelRow =
  | { kind: "group"; key: string; group: ModelGroup }
  | { kind: "item"; key: string; item: ModelGroupItem };

/** `expanded` is the persisted per-group map; anything not `true` is shut.
 *  Row keys are namespaced by group, because grouped mode can legitimately
 *  hold the same model id under two types. */
export function flattenModelGroups(
  groups: ModelGroup[],
  expanded: Record<string, boolean>,
): ModelRow[] {
  const rows: ModelRow[] = [];
  for (const group of groups) {
    rows.push({ kind: "group", key: group.key, group });
    if (expanded[group.key] !== true) continue;
    for (const item of group.items) {
      rows.push({
        kind: "item",
        key: `${group.key}:${item.kind}:${item.id}`,
        item,
      });
    }
  }
  return rows;
}
