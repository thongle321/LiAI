/** Model selector for companions — PocketPal's ModelSelector dropdown.
 *
 * A Selector: outlined button with chevron-down, native Menu (iOS) or
 * dropdown (Android) with MenuItem rows. Options from downloaded models
 * plus a "None" option. Label "Default Model", placeholder "Select model".
 */

import { useMemo } from "react";

import { PickerMenu } from "../picker-menu";
import { useModelStore } from "@/store/model-store.ts";
import type { CompanionModelRef } from "@/types/companion.ts";

export function ModelSelector({
  value,
  onChange,
  label = "Default Model",
  placeholder = "Select model",
}: {
  /** The currently selected model ref, or undefined/null for "none". */
  value?: CompanionModelRef | null;
  /** Called with the selected model when the user picks one. */
  onChange: (model: CompanionModelRef | null) => void;
  /** Label for the selector. */
  label?: string;
  /** Placeholder text when nothing is selected. */
  placeholder?: string;
}) {
  const models = useModelStore((s) => s.models);

  // Filter to only downloaded models, matching the current pills behavior
  const downloaded = useMemo(
    () => models.filter((m) => m.downloadStatus === "completed"),
    [models],
  );

  const options = useMemo(
    () => [
      "", // empty string for "None" option
      ...downloaded.map((m) => m.id),
    ],
    [downloaded],
  );

  // Get the current model's id, or empty string for "None"
  const selectedId = value?.id ?? "";

  // Show "Select model" when nothing selected
  const displayFor = (id: string): string => {
    if (id === "") {
      return placeholder;
    }
    const model = downloaded.find((m) => m.id === id);
    return model ? `${model.name} • ${model.author}` : placeholder;
  };

  return (
    <PickerMenu<string>
      label={label}
      options={options}
      value={selectedId}
      onChange={(id) => {
        if (id === "") {
          onChange(null);
        } else {
          const model = downloaded.find((m) => m.id === id);
          if (model) {
            onChange({
              id: model.id,
              name: model.name,
              author: model.author,
              ...(model.files[0]
                ? {
                    file: {
                      name: model.files[0].name,
                      size: model.files[0].size,
                    },
                  }
                : {}),
            });
          }
        }
      }}
      show={displayFor}
      variant="outlined"
    />
  );
}