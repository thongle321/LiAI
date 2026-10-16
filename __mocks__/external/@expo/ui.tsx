/** Jest stub for `@expo/ui`.
 *
 * `@expo/ui` mounts real SwiftUI / Jetpack Compose hosts, which do not exist
 * under Jest, and importing it unmocked reaches for native views at module
 * scope. Every export below is therefore a plain React Native component that
 * renders its children and nothing else.
 *
 * The stub is deliberately behaviour-free: assertions about what a native
 * control DOES belong on device. What it guarantees is that mounting a screen
 * which composes `Host`, `Switch`, `Slider`, `Picker` or `BottomSheet` renders
 * its children instead of throwing.
 */

import React from "react";
import { View } from "react-native";

export type ExpoUiStubProps = {
  children?: React.ReactNode;
} & Record<string, unknown>;

/** A component that renders its children inside a plain `View`. */
function stub(name: string): React.ComponentType<ExpoUiStubProps> {
  const Component: React.ComponentType<ExpoUiStubProps> = ({ children }) =>
    React.createElement(View, null, children);
  Component.displayName = `ExpoUiStub(${name})`;
  return Component;
}

/** A stub that also carries the nested statics the real component exposes. */
function compound(name: string, statics: Record<string, unknown>) {
  const Component = stub(name) as React.ComponentType<ExpoUiStubProps> &
    Record<string, unknown>;
  Object.assign(Component, statics);
  return Component;
}

export const Host = stub("Host");
export const Column = stub("Column");
export const Row = stub("Row");
export const Text = stub("Text");
export const Button = stub("Button");
export const ScrollView = stub("ScrollView");
export const Switch = compound("Switch", {
  /** `Switch` has no nested exports; kept for symmetry with the others. */
});
export const Slider = stub("Slider");
export const Checkbox = stub("Checkbox");
export const Collapsible = compound("Collapsible", {
  Trigger: stub("Collapsible.Trigger"),
  Content: stub("Collapsible.Content"),
});
export const BottomSheet = stub("BottomSheet");
export const Icon = stub("Icon");
export const List = compound("List", { Item: stub("List.Item") });
export const FieldGroup = compound("FieldGroup", {
  Section: stub("FieldGroup.Section"),
});
export const RNHostView = stub("RNHostView");
export const Spacer = stub("Spacer");
export const TextInput = stub("TextInput");
export const Picker = compound("Picker", { Item: stub("Picker.Item") });

/** `State`, `State.useSharedState`, and the rest of the hook surface. */
export const State = { useSharedState: () => undefined };
export const useSharedState = () => undefined;
export const useBinding = () => undefined;
export const createBinding = () => undefined;

export default {
  Host,
  Column,
  Row,
  Text,
  Button,
  ScrollView,
  Switch,
  Slider,
  Checkbox,
  Collapsible,
  BottomSheet,
  Icon,
  List,
  FieldGroup,
  RNHostView,
  Spacer,
  TextInput,
  Picker,
  State,
  useSharedState,
  useBinding,
  createBinding,
};
