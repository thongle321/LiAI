/** The editor's dynamic parameter controls — PocketPal's DynamicParameters/*.
 *
 *  A companion declares its parameters in the system-prompt schema block; the
 *  type decides the control:
 *  - `text`        → one-line input
 *  - `select`      → single choice from `options` (the shared PickerMenu)
 *  - `combobox`    → free text WITH suggestions from `options`
 *  - `datetime_tag`→ inserts `{{datetime}}`, resolved when the prompt renders
 *
 *  PocketPal's combobox opens an anchored Paper Menu. LiAI has no portal menu,
 *  so the suggestions render inline under the input while it is focused —
 *  same free-text-plus-choices behaviour, no second popup layer.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useColors } from "@/themes/tokens.ts";
import { PickerMenu } from "@/components/picker-menu";
import { RowLabel } from "@/components/settings-rows.tsx";
import { CompanionTextRow } from "./companion-text-row.tsx";
import {
  datetimeTagState,
  filterComboboxOptions,
  normalizeParameterType,
  parameterLabel,
} from "@/services/companions/parameter-fields.ts";
import type { ParameterDefinition } from "@/types/companion.ts";

/** A stored value as the text controls show it. */
function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function ComboboxField({
  parameter,
  value,
  onChange,
}: {
  parameter: ParameterDefinition;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const text = stringValue(value);
  const options = filterComboboxOptions(parameter.options, text);
  const label = parameterLabel(parameter);

  return (
    <View className="mb-5">
      <RowLabel label={label} description={parameter.description} />
      <TextInput
        value={text}
        placeholder={parameter.placeholder}
        placeholderTextColor={colors.secondaryTextMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={onChange}
        className="min-h-10 rounded-lg border border-border bg-surface-1 px-3 py-2 text-body"
        accessibilityLabel={label}
      />
      {focused && options.length > 0 ? (
        <View className="mt-2 overflow-hidden rounded-lg border border-border bg-surface-1">
          {options.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                onChange(option);
                setFocused(false);
              }}
              className="min-h-10 justify-center border-b border-border px-3 active:opacity-80"
              accessibilityRole="button"
            >
              <Text className="text-body">{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DateTimeTagField({
  parameter,
  value,
  onChange,
}: {
  parameter: ParameterDefinition;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const state = datetimeTagState(parameter, value);
  return (
    <View className="mb-5">
      <RowLabel label={parameterLabel(parameter)} description={parameter.description} />
      <Pressable
        onPress={() => onChange("{{datetime}}")}
        className="min-h-14 items-center justify-center rounded-lg border border-border bg-surface-1 px-4 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={parameterLabel(parameter)}
      >
        <Text className={`text-center ${state.selected ? "text-body" : "text-quiet"}`}>
          {state.title}
        </Text>
        {state.caption !== null ? (
          <Text className="mt-1 text-center text-quiet">{state.caption}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Every parameter the companion declares, in schema order. */
export function DynamicParameterFields({
  schema,
  values,
  onChange,
}: {
  schema: ParameterDefinition[];
  values: Record<string, unknown>;
  /** `key` is the parameter's schema key; `value` its new stored value. */
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {schema.map((parameter) => {
        const type = normalizeParameterType(parameter.type);
        const value = values[parameter.key];

        if (type === "select") {
          return (
            <View key={parameter.key} className="mb-5">
              <RowLabel
                label={parameterLabel(parameter)}
                description={parameter.description}
              />
              <PickerMenu<string>
                label={parameterLabel(parameter)}
                options={parameter.options ?? []}
                value={stringValue(value)}
                onChange={(next) => onChange(parameter.key, next)}
                show={(option) => option || `Select ${parameter.label.toLowerCase()}`}
                variant="outlined"
              />
            </View>
          );
        }

        if (type === "combobox") {
          return (
            <ComboboxField
              key={parameter.key}
              parameter={parameter}
              value={value}
              onChange={(next) => onChange(parameter.key, next)}
            />
          );
        }

        if (type === "datetime_tag") {
          return (
            <DateTimeTagField
              key={parameter.key}
              parameter={parameter}
              value={value}
              onChange={(next) => onChange(parameter.key, next)}
            />
          );
        }

        return (
          <CompanionTextRow
            key={parameter.key}
            label={parameterLabel(parameter)}
            description={parameter.description}
            value={stringValue(value)}
            placeholder={parameter.placeholder}
            onChangeText={(next) => onChange(parameter.key, next)}
          />
        );
      })}
    </>
  );
}
