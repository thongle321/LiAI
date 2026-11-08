/** The dynamic-parameter rules the editor's field components share
 *  (PocketPal's DynamicParameters/*): which control a parameter gets, which
 *  combobox suggestions a query leaves, and what the datetime tag shows.
 *
 *  Kept out of the components because all four are pure — the native inputs
 *  they drive (expo/ui pickers) are device territory.
 */

import type { ParameterDefinition } from "@/types/companion.ts";
import {
  datetimeTagState,
  filterComboboxOptions,
  normalizeParameterType,
  parameterLabel,
} from "../parameter-fields.ts";

function parameter(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return {
    key: "world",
    type: "text",
    label: "World",
    required: false,
    ...overrides,
  };
}

describe("normalizeParameterType", () => {
  it("keeps the three non-text types the editor can render", () => {
    expect(normalizeParameterType("select")).toBe("select");
    expect(normalizeParameterType("combobox")).toBe("combobox");
    expect(normalizeParameterType("datetime_tag")).toBe("datetime_tag");
  });

  it("falls back to text for anything a stored or imported companion carries", () => {
    // The reference's parser maps unknown schema types to text; an older
    // export with a type this build has never heard of must still open.
    expect(normalizeParameterType("text")).toBe("text");
    expect(normalizeParameterType("slider")).toBe("text");
    expect(normalizeParameterType(undefined)).toBe("text");
  });
});

describe("parameterLabel", () => {
  it("marks required parameters the way the reference does", () => {
    expect(parameterLabel(parameter({ label: "World", required: true }))).toBe("World*");
    expect(parameterLabel(parameter({ label: "World" }))).toBe("World");
  });
});

describe("filterComboboxOptions", () => {
  const options = ["Dragon", "drake", "Elf"];

  it("narrows case-insensitively on a query", () => {
    expect(filterComboboxOptions(options, "dra")).toEqual(["Dragon", "drake"]);
  });

  it("offers every option before the user types", () => {
    expect(filterComboboxOptions(options, "   ")).toEqual(options);
  });

  it("is empty when the parameter declares no options", () => {
    expect(filterComboboxOptions(undefined, "dra")).toEqual([]);
  });
});

describe("datetimeTagState", () => {
  it("reads the inserted tag as selected", () => {
    expect(datetimeTagState(parameter(), "{{datetime}}")).toEqual({
      selected: true,
      title: "Current Date & Time Tag",
      caption: "Will be replaced with current date/time when used",
    });
  });

  it("prompts with the parameter's placeholder before anything is inserted", () => {
    expect(datetimeTagState(parameter({ placeholder: "When?" }), "")).toEqual({
      selected: false,
      title: "When?",
      caption: null,
    });
  });

  it("falls back to the reference's tap prompt with no placeholder", () => {
    expect(datetimeTagState(parameter(), undefined).title).toBe(
      "Tap to insert current date & time tag",
    );
  });
});
