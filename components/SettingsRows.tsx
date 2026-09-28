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

import { Children, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
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
export function PickerRow({
  label,
  description,
  options,
  value,
  onChange,
  displayFor,
}: {
  label: string;
  description?: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  /** Label for the selected value; defaults to the value itself. */
  displayFor?: (value: string) => string;
}) {
  const show = displayFor ?? ((v: string) => v);
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
 * @expo/ui's Slider is linear (min/max/step), so this is only for ranges
 * where linear travel works — GPU layers and CPU threads. Context size
 * (512..131072) and batch (1..8192) keep the stepper, because one pixel of
 * a linear track spans ~1000 tokens and the thumb can never land on 4096.
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
      {open ? Children.map(children, (child) => <View className="row">{child}</View>) : null}
    </View>
  );
}
