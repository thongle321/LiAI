/** The editor's dynamic parameter controls (PocketPal's DynamicParameters/*).
 *
 *  One control per declared type: a text input, a single-select picker, a
 *  free-text combobox with suggestions, and the datetime tag button. The
 *  native picker itself renders nothing under Jest (picker-menu.tsx
 *  fallback), so the select case asserts what this component owns — the
 *  labelled field and the absence of a free-text input — and leaves the
 *  popup to device territory.
 */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { DynamicParameterFields } from "../dynamic-parameter-fields.tsx";
import type { ParameterDefinition } from "@/types/companion.ts";

/** The editor owns the values, so the fields are controlled: this harness
 *  applies each change the way the sheet's draft does. */
function Harness({
  schema,
  initial = {},
  onChange,
}: {
  schema: ParameterDefinition[];
  initial?: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  return (
    <DynamicParameterFields
      schema={schema}
      values={values}
      onChange={(key, value) => {
        onChange(key, value);
        setValues((previous) => ({ ...previous, [key]: value }));
      }}
    />
  );
}

function renderFields(
  schema: ParameterDefinition[],
  values: Record<string, unknown> = {},
) {
  const onChange = jest.fn();
  render(<Harness schema={schema} initial={values} onChange={onChange} />);
  return onChange;
}

const world: ParameterDefinition = {
  key: "world",
  type: "text",
  label: "World",
  required: true,
  placeholder: "e.g. Medieval kingdom",
  description: "The setting",
};

describe("DynamicParameterFields", () => {
  it("renders a text parameter as a labelled input and reports its value", () => {
    const onChange = renderFields([world]);

    fireEvent.changeText(screen.getByLabelText("World*"), "Ashen Vale");

    expect(onChange).toHaveBeenCalledWith("world", "Ashen Vale");
  });

  it("shows the parameter's description beside its label", () => {
    renderFields([world]);
    expect(screen.getByText("The setting")).toBeTruthy();
  });

  it("renders a select parameter without a free-text input", () => {
    const onChange = renderFields([
      {
        key: "mood",
        type: "select",
        label: "Mood",
        required: false,
        options: ["Calm", "Stormy"],
      },
    ]);

    expect(screen.getByText("Mood")).toBeTruthy();
    expect(screen.queryByLabelText("Mood")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers only matching combobox options and applies the pressed one", () => {
    const onChange = renderFields(
      [
        {
          key: "realm",
          type: "combobox",
          label: "Realm",
          required: false,
          options: ["Dragon Isles", "Drake Hollow", "Elven Wood"],
        },
      ],
      { realm: "" },
    );

    const input = screen.getByLabelText("Realm");
    fireEvent(input, "focus");
    fireEvent.changeText(input, "dra");

    expect(screen.getByText("Dragon Isles")).toBeTruthy();
    expect(screen.getByText("Drake Hollow")).toBeTruthy();
    expect(screen.queryByText("Elven Wood")).toBeNull();

    fireEvent.press(screen.getByText("Drake Hollow"));
    expect(onChange).toHaveBeenCalledWith("realm", "Drake Hollow");
  });

  it("inserts the datetime tag when pressed", () => {
    const onChange = renderFields([
      { key: "now", type: "datetime_tag", label: "When", required: false },
    ]);

    fireEvent.press(screen.getByLabelText("When"));
    expect(onChange).toHaveBeenCalledWith("now", "{{datetime}}");
  });

  it("shows the inserted tag instead of the tap prompt", () => {
    renderFields(
      [{ key: "now", type: "datetime_tag", label: "When", required: false }],
      { now: "{{datetime}}" },
    );

    expect(screen.getByText("Current Date & Time Tag")).toBeTruthy();
  });
});
