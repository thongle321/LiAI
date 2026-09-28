/** Shared settings rows: native toggle + stepper + the section chrome.
 *
 * Toggles are real native switches (SwiftUI on iOS, Compose on Android) via
 * @expo/ui — the platform owns the control, the app owns the label. The
 * root Host in app/_layout.tsx seeds them with Signal Blue and forces the
 * light scheme, so they land in the app's world rather than the platform's.
 *
 * The card is the .rows BEM block in global.css (Clean White, 1px Hairline,
 * dividers edge to edge, 48dp floor); SettingsSection owns the title and the
 * rhythm between groups, so no screen hand-rolls that again.
 *
 * Every row carries a description (DESIGN.md, Settings): a bare label says
 * nothing about what the value does, and a control whose effect the user
 * cannot predict is worse than no control at all.
 */

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Host, Picker, Slider, Switch } from "@expo/ui";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

/** Label + optional description, the left half of every row. */
function RowLabel({ label, description }: { label: string; description?: string }) {
  return (
    <View className="flex-1 pr-4">
      <Text className="font-sans text-body-lg text-primary-text">{label}</Text>
      {description ? (
        <Text className="mt-1 font-sans text-body-md text-secondary-text">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

/** A titled group of rows. `children` are the .row-wrapped contents. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-6">
      {title ? (
        <Text className="mb-2 font-sans-semibold text-h3 text-primary-text">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text className="mb-2 font-sans text-body-md text-secondary-text">
          {description}
        </Text>
      ) : null}
      <View className="rows">{children}</View>
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  on,
  onPress,
}: {
  label: string;
  description?: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between py-2"
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <RowLabel label={label} description={description} />
      {/* No `label` on the native Switch: on iOS it draws a second copy of
          the text next to the control, so the row's own Text is the label and
          the Host carries the accessible name for it. */}
      <Host matchContents>
        <Switch value={on} onValueChange={onPress} testID={`toggle-${label}`} />
      </Host>
    </View>
  );
}

/** Single-selection native picker (SwiftUI Menu / Compose menu).
 *
 * Best for a closed set that does not fit inline — voices, providers. The
 * root Host seeds it with Signal Blue, so the native menu lands in the
 * app's world rather than the platform's default tint.
 */
export function PickerRow<T extends string>({
  label,
  description,
  options,
  value,
  onChange,
  displayFor,
}: {
  label: string;
  description?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Label for the selected value; defaults to the value itself. */
  displayFor?: (value: T) => string;
}) {
  const show = displayFor ?? ((v: T) => String(v));
  return (
    <View className="flex-row items-center justify-between py-2">
      <RowLabel label={label} description={description} />
      <Host matchContents>
        <Picker
          selectedValue={value}
          onValueChange={onChange}
          appearance="menu"
          testID={`picker-${label}`}
        >
          {options.map((option) => (
            <Picker.Item key={option} label={show(option)} value={option} />
          ))}
        </Picker>
      </Host>
    </View>
  );
}

export function StepperRow({
  label,
  description,
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  description?: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <RowLabel label={label} description={description} />
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onMinus}
          disabled={minusDisabled}
          className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1"
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={16} color={colors.primary} />
        </Pressable>
        <Text className="w-14 text-center font-sans text-body-md text-primary-text">{display}</Text>
        <Pressable
          onPress={onPlus}
          disabled={plusDisabled}
          className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1"
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Plus size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

/** Continuous numeric row backed by a real native slider.
 *
 * @expo/ui's Slider is linear (min/max/step), so this suits ranges where
 * linear travel works. Two things are NOT sliders: context size
 * (512..131072, where one pixel spans ~1000 tokens and the thumb can never
 * land on 4096) and any value typed rather than swept — both are text
 * fields, via TextFieldRow.
 */
export function SliderRow({
  label,
  description,
  display,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  description?: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className="py-2">
      <View className="flex-row items-center justify-between">
        <RowLabel label={label} description={description} />
        <Text className="font-sans text-body-md text-primary-text">{display}</Text>
      </View>
      <View className="mt-2">
        <Host matchContents={{ horizontal: true }}>
          <Slider
            value={value}
            min={min}
            max={max}
            step={step}
            onValueChange={onChange}
            testID={`slider-${label}`}
          />
        </Host>
      </View>
    </View>
  );
}

/** Inline multi-choice control (the .seg BEM block). Used where a native
 *  picker would be overkill because every option stays visible. */
export function Segmented<T extends string | number>({
  label,
  description,
  value,
  options,
  displayFor,
  onPick,
}: {
  label: string;
  description?: string;
  value: T;
  options: readonly T[];
  displayFor?: (value: T) => string;
  onPick: (value: T) => void;
}) {
  const show = displayFor ?? ((v: T) => String(v));
  return (
    <View className="py-2">
      <RowLabel label={label} description={description} />
      <View className="mt-2 flex-row gap-2">
        {options.map((o) => (
          <Pressable
            key={String(o)}
            onPress={() => onPick(o)}
            className={o === value ? "seg seg--active" : "seg"}
            accessibilityRole="radio"
            accessibilityLabel={show(o)}
            accessibilityState={{ selected: o === value }}
          >
            <Text className={o === value ? "seg-label seg-label--active" : "seg-label"}>
              {show(o)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Numeric text field row, debounced.
 *
 * For ranges a slider physically cannot serve: context size spans
 * 512..131072, where one pixel of a linear track is ~1000 tokens and the
 * thumb can never land on 4096. Typing can. (PocketPal solves the same
 * problem the same way.)
 */
export function TextFieldRow({
  label,
  description,
  value,
  min,
  placeholder,
  invalidMessage,
  onCommit,
}: {
  label: string;
  description?: string;
  value: number;
  min?: number;
  placeholder?: string;
  /** Shown instead of the value when the typed text is out of range. */
  invalidMessage?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(`${value}`);
  const [invalid, setInvalid] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);

  // Adopt an external change (a reset), but never our own echo: the setters
  // clamp, so without this, typing "1" and pausing would rewrite the field to
  // 512 mid-word.
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(`${value}`);
    setInvalid(false);
  }, [value]);

  function handleChange(text: string): void {
    setDraft(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const parsed = Number(text);
      if (text.trim() === "" || !Number.isFinite(parsed)) {
        setInvalid(true);
        return;
      }
      if (min !== undefined && parsed < min) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      committed.current = parsed;
      onCommit(Math.round(parsed));
    }, 500);
  }

  return (
    <View className="py-2">
      <RowLabel label={label} description={description} />
      <TextInput
        value={draft}
        onChangeText={handleChange}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryText}
        accessibilityLabel={label}
        className={`mt-2 rounded-lg border px-5 py-3 font-sans text-body-md ${
          invalid ? "border-error text-primary-text" : "border-border"
        }`}
      />
      {invalid && invalidMessage ? (
        <Text className="mt-1 font-sans text-body-sm text-error">{invalidMessage}</Text>
      ) : null}
    </View>
  );
}

/** A row whose control is an action — a button, not a value.
 *
 * Consent and secrets both belong here: consent is a one-way
 * acknowledgement, so a switch that silently flips both ways is the wrong
 * control, and a key sitting on the screen is worse than one behind a
 * button you dismiss.
 */
export function ActionRow({
  label,
  description,
  buttonLabel,
  onPress,
  variant = "primary",
}: {
  label: string;
  description?: string;
  buttonLabel: string;
  onPress: () => void;
  /** Whole-string literals, never interpolated: Uniwind compiles className
   *  from literals, and `btn--${variant}` is the failure mode AGENTS.md
   *  calls out. */
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <View className="py-3">
      <RowLabel label={label} description={description} />
      <Pressable
        onPress={onPress}
        className={
          variant === "primary"
            ? "btn btn--primary mt-2 self-start"
            : variant === "ghost"
              ? "btn btn--ghost mt-2 self-start"
              : "btn btn--secondary mt-2 self-start"
        }
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
      >
        <Text
          className={
            variant === "primary"
              ? "font-sans-semibold text-body-md text-on-primary"
              : "font-sans text-body-md text-primary"
          }
        >
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

/** A row that opens something: value on the right, chevron last. */
export function NavRow({
  label,
  description,
  value,
  onPress,
}: {
  label: string;
  description?: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-2"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <RowLabel label={label} description={description} />
      <View className="flex-row items-center gap-1">
        {value ? (
          <Text className="font-sans text-body-md text-secondary-text">{value}</Text>
        ) : null}
        <ChevronRight size={16} color={colors.secondaryText} />
      </View>
    </Pressable>
  );
}

/** Collapsed by default: power-user tuning is not what a first run reads
 *  past, and a screen with 28 visible rows is a wall (DESIGN.md, Settings). */
export function AdvancedGroup({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between py-2"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
      >
        <RowLabel label={label} description={description} />
        <ChevronDown
          size={16}
          color={colors.secondaryText}
          style={open ? undefined : { transform: [{ rotate: "-90deg" }] }}
        />
      </Pressable>
      {/* The children are wrapped here, not at each call site: .row is what
          carries the 16px inset, the 48dp floor and the divider, and rows
          written bare lose all three. */}
      {open
        ? Children.toArray(children).map((child) => (
            <View className="row" key={Children.count(children) + String(child)}>
              {child}
            </View>
          ))
        : null}
    </View>
  );
}
