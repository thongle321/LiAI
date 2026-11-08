/** Dynamic-parameter field rules (PocketPal's DynamicParameters/*).
 *
 *  The four controls differ only in these decisions, so they live here as
 *  pure functions instead of inside the components: the components stay a
 *  thin shell over a native input, and the rules are node-testable.
 */

import type { ParameterDefinition, ParameterType } from "@/types/companion.ts";

/** A stored or imported companion can carry a type this build never wrote
 *  (an older/newer export). The reference maps those to text rather than
 *  dropping the parameter, so the editor can always render something. */
export function normalizeParameterType(type: unknown): ParameterType {
  if (type === "select" || type === "combobox" || type === "datetime_tag") {
    return type;
  }
  return "text";
}

/** The reference appends `*` to a required label instead of a separate mark. */
export function parameterLabel(parameter: ParameterDefinition): string {
  return parameter.required ? `${parameter.label}*` : parameter.label;
}

/** Combobox suggestions: a case-insensitive substring match, every option
 *  while the query is blank (the reference's `isSearching` branch). */
export function filterComboboxOptions(
  options: readonly string[] | undefined,
  query: string,
): string[] {
  const all = options ?? [];
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...all];
  return all.filter((option) => option.toLowerCase().includes(needle));
}

export interface DateTimeTagState {
  selected: boolean;
  title: string;
  caption: string | null;
}

/** What the datetime field shows: the inserted tag, or the tap prompt. */
export function datetimeTagState(
  parameter: ParameterDefinition,
  value: unknown,
): DateTimeTagState {
  if (value === "{{datetime}}") {
    return {
      selected: true,
      title: "Current Date & Time Tag",
      caption: "Will be replaced with current date/time when used",
    };
  }
  return {
    selected: false,
    title: parameter.placeholder || "Tap to insert current date & time tag",
    caption: null,
  };
}
