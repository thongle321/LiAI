/** Whether a catalog preset has fully landed, which is what moves it from
 *  Available to Download to Ready to Use (PocketPal: a finished model leaves
 *  the download set).
 *
 *  Specs are stored per (preset × file), so this asks about every file the
 *  preset ships — the catalog ships one each today, and the card downloads
 *  exactly that one (services/models/preset-spec.ts).
 */

import { presetSpecId } from "./huggingface.ts";
import type { ModelSpec, PresetModel } from "@/types/models.ts";

export function isPresetDownloaded(models: ModelSpec[], preset: PresetModel): boolean {
  return preset.files.every((f) => {
    const spec = models.find((m) => m.id === presetSpecId(preset.id, f.name));
    return spec?.downloadStatus === "completed";
  });
}
