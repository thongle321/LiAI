/** Shared settings rows: native toggle + stepper. One implementation, reused.
 *
 * Toggles are real native switches (SwiftUI on iOS, Compose on Android) via
 * @expo/ui — the platform owns the control, the app owns the label. The
 * root Host in app/_layout.tsx seeds them with Signal Blue and forces the
 * light scheme, so they land in the app's world rather than the platform's.
 */

import { Pressable, Text, View } from "react-native";
import { Host, Picker, Slider, Switch } from "@expo/ui";
import { Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function ToggleRow({
  label,
  on,
  onPress,
}: {
  label: string;
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
      <Text className="flex-1 pr-4 font-sans text-body-md text-primary-text">{label}</Text>
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
  options,
  value,
  onChange,
  displayFor,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  /** Label for the selected value; defaults to the value itself. */
  displayFor?: (value: string) => string;
}) {
  const show = displayFor ?? ((v: string) => v);
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="flex-1 pr-4 font-sans text-body-md text-primary-text">{label}</Text>
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
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
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
  display,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
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
        <Text className="font-sans text-body-md text-primary-text">{label}</Text>
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
