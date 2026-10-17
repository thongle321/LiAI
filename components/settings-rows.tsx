/** Shared settings rows: native toggle + stepper + the section chrome.
 *
 * Toggles are real native switches (SwiftUI on iOS, Compose on Android) via
 * @expo/ui — the platform owns the control, the app owns the label. The
 * root Host in app/_layout.tsx seeds them with Signal Blue and forces the
 * light scheme, so they land in the app's world rather than the platform's.
 *
 * The card is the .rows BEM block in global.css (Clean White, 1px Hairline,
 * dividers edge to edge, 48dp floor); SettingsSection owns the rhythm
 * between groups (and, for now, the lead-in description), so no screen
 * hand-rolls that again. Section TITLES are gone (font-size mirror Q6=B).
 *
 * Every row carries a description (DESIGN.md, Settings): a bare label says
 * nothing about what the value does, and a control whose effect the user
 * cannot predict is worse than no control at all.
 */

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Host, Switch } from "@expo/ui";
import Slider from "@expo/ui/community/slider";
import { ChevronDown, ChevronRight, Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { PickerMenu } from "./picker-menu";

/** Type rungs a zone renders at (font-size mirror,
 *  docs/research/font-size-comparison.md). Settings screens sit on the
 *  defaults — pocketpal titleMedium label / labelSmall description (16/11);
 *  the generation sheet wraps its rows in their tighter CompletionSettings
 *  rungs (11/12) via RowSizeProvider. The values are whole class names:
 *  Uniwind generates each from its --text-* theme token, so composing them
 *  into a className compiles (the literals also live at every call site). */
const RowSize = createContext<{ label: string; desc: string }>({
  label: "text-body-lg",
  desc: "text-xs",
});

export function RowSizeProvider({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ label, desc }), [label, desc]);
  return <RowSize.Provider value={value}>{children}</RowSize.Provider>;
}

/** Label + optional description, the left half of every row. */
export function RowLabel({ label, description }: { label: string; description?: string }) {
  const size = useContext(RowSize);
  return (
    <View className="flex-1 pr-4">
      <Text className={`font-sans ${size.label} text-primary-text`}>{label}</Text>
      {description ? (
        <Text className={`mt-1 font-sans ${size.desc} text-secondary-text`}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

/** A titled group of rows. `children` are the .row-wrapped contents. */
export function SettingsSection({
  description,
  children,
  plain = false,
}: {
  description?: string;
  children: ReactNode;
  /** PocketPal's param card: 16px padding, 24px rhythm, NO dividers (the
   *  `.row` class is what draws them, so plain children skip it). */
  plain?: boolean;
}) {
  return (
    <View className="mb-6">
      {description ? (
        <Text className="mb-2 font-sans text-body-md text-secondary-text">
          {description}
        </Text>
      ) : null}
      <View className={plain ? "rows rows--plain" : "rows"}>{children}</View>
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
      {/* Seeded HERE, not inherited: each @expo/ui Host builds its own native
          theme, and a Host without seedColor falls back to the device's
          Material You wallpaper — which is exactly what turned every switch
          teal. colorScheme="light" keeps the light lock when the device is
          dark (DESIGN.md, Native Palette Rule). */}
      <Host matchContents ignoreSafeArea="keyboard" colorScheme="light" seedColor={colors.primary}>
        <Switch value={on} onValueChange={onPress} testID={`toggle-${label}`} />
      </Host>
    </View>
  );
}

/** Single-selection native picker row: label left, native popup right.
 *
 * The popup is the one surface in this file that @expo/ui cannot supply
 * cross-platform: iOS gets the SwiftUI Menu, Android the Compose dropdown
 * (the universal Picker anchors on a 56dp M3 TextField on Android). Metro
 * picks `PickerMenu.ios.tsx` / `.android.tsx`; the row chrome and API
 * stay shared here.
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
      <PickerMenu label={label} options={options} value={value} onChange={onChange} show={show} />
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
          onPress={() => { void Haptics.selectionAsync(); onMinus(); }}
          disabled={minusDisabled}
          className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-1"
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={16} color={colors.primary} />
        </Pressable>
        <Text className="w-14 text-center font-sans text-body-md text-primary-text">{display}</Text>
        <Pressable
          onPress={() => { void Haptics.selectionAsync(); onPlus(); }}
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
  // PocketPal's InputSlider arrangement: label → description → [slider | inline
  // numeric input]. The input mirrors the slider live while dragging and
  // commits on blur/submit; slider commits debounce 300ms like theirs.
  const size = useContext(RowSize);
  const [text, setText] = useState(display);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committed = useRef(value);

  function echo(v: number): string {
    return step >= 1 ? `${Math.round(v)}` : v.toFixed(2);
  }

  function clampTo(v: number): number {
    const c = Math.min(max, Math.max(min, v));
    return step > 0 ? Math.round((c - min) / step) * step + min : c;
  }

  // Adopt an external change (a reset, a Save reload), never our own echo:
  // the setters clamp, so without the guard typing would rewrite the field
  // mid-word — the same guard TextFieldRow carries.
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setText(display);
  }, [value, display]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleSlide(v: number): void {
    const next = clampTo(v);
    setText(echo(next));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      committed.current = next;
      onChange(next);
    }, 300);
  }

  function commitTyped(): void {
    if (timer.current) clearTimeout(timer.current);
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      // Junk in the box: restore what the value says, commit nothing.
      setText(echo(committed.current));
      return;
    }
    const next = clampTo(parsed);
    committed.current = next;
    setText(echo(next));
    onChange(next);
  }

  return (
    <View className="py-2">
      <Text className={`font-sans ${size.label} text-primary-text`}>{label}</Text>
      <Text className={`mt-1 font-sans ${size.desc} text-secondary-text`}>{description}</Text>
      <View className="mt-2 flex-row items-center gap-2">
        {/* @expo/ui's COMMUNITY Slider — a drop-in for
         * @react-native-community/slider (PocketPal's choice), which wraps
         * its own Host. That Host takes no seedColor from outside, so any
         * theme-painted part lands in the device wallpaper palette — which
         * is what put teal dots on the track. `step` is therefore NOT
         * passed: Material draws ticks for stepped sliders, and the board's
         * slider is a clean track, so the row runs continuous and rounds
         * back to its step (the original row's own formula). Tints carry
         * the brand: Signal Blue thumb and active track, Mist inactive. */}
        <Slider
          value={value}
          minimumValue={min}
          maximumValue={max}
          onValueChange={handleSlide}
          thumbTintColor={colors.primary}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.surface2}
          // flex via style: the slider is a third-party native component
          // with no className (the AGENTS.md exception).
          style={{ flex: 1 }}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          onBlur={commitTyped}
          onEndEditing={commitTyped}
          keyboardType="numeric"
          accessibilityLabel={`${label} value`}
          selectTextOnFocus
          placeholder={display}
          placeholderTextColor={colors.secondaryText}
          className="w-24 rounded-lg border border-border px-3 py-2 text-right font-sans text-body-lg text-primary-text"
        />
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
            onPress={() => { void Haptics.selectionAsync(); onPick(o); }}
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
  error,
  onCommit,
}: {
  label: string;
  description?: string;
  value: number;
  min?: number;
  placeholder?: string;
  /** Shown instead of the value when the typed text is out of range. */
  invalidMessage?: string;
  /** External (Save-time) validation mark: shows regardless of what the
   *  field itself detected while typing — Q6=C's inline layer. */
  error?: string;
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
        className={`mt-2 rounded-lg border px-5 py-3 font-sans text-body-lg ${
          invalid || error !== undefined
            ? "border-error text-primary-text"
            : "border-border"
        }`}
      />
      {invalid || error !== undefined ? (
        <Text className="mt-1 font-sans text-body-sm text-error">
          {error ?? invalidMessage}
        </Text>
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
  disabled = false,
}: {
  label: string;
  description?: string;
  buttonLabel: string;
  onPress: () => void;
  /** Pocketpal gates the key row on consent (Q5): a consent gate you can
   *  route around by tapping is theater. */
  disabled?: boolean;
  /** Whole-string literals, never interpolated: Uniwind compiles className
   *  from literals, and `btn--${variant}` is the failure mode AGENTS.md
   *  calls out. */
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <View className="py-3">
      <RowLabel label={label} description={description} />
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityState={{ disabled }}
        className={`${
          variant === "primary"
            ? "btn btn--primary active:opacity-80"
            : variant === "ghost"
              ? "btn btn--ghost active:opacity-80"
              : "btn btn--secondary active:opacity-80"
        } mt-2 self-start${disabled ? " opacity-40" : ""}`}
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
        className="flex-row items-center justify-between py-2 active:opacity-70"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
      >
        <RowLabel label={label} description={description} />
        {/* Glyph swap, not a transform: a style-rotated lucide icon
            rendered INVISIBLE on device (the closed group showed no chevron
            at all). Right when closed, down when open — the affordance
            DESIGN.md specifies: "rotates to point down when open". */}
        {open ? (
          <ChevronDown size={16} color={colors.secondaryText} />
        ) : (
          <ChevronRight size={16} color={colors.secondaryText} />
        )}
      </Pressable>
      {/* The children are wrapped here, not at each call site: .row is what
          carries the 16px inset, the 48dp floor and the divider, and rows
          written bare lose all three. */}
      {open
        ? Children.toArray(children).map((child, index) => (
            // The index, because it is the only key guaranteed unique among
            // siblings — and safe here: this list is a fixed, unfiltered set
            // of children that holds no per-row state, so a reordering key
            // buys nothing. (The previous version synthesised one from
            // String(child), which is always "[object Object]" and so
            // collapsed to a single key for every row — a crash.)
            <View className={index === Children.count(children) - 1 ? "row row--last" : "row"} key={index}>
              {child}
            </View>
          ))
        : null}
    </View>
  );
}
