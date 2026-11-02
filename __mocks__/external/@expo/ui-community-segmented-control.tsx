/** Jest stub for `@expo/ui/community/segmented-control`.
 *
 * The real module mounts native SwiftUI (iOS) / Jetpack Compose (Android)
 * segmented controls, which do not exist under Jest. This stub renders one
 * pressable per value so dispatch logic (onChange -> nativeEvent) can be
 * exercised without a device.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";

type MockProps = {
  values?: string[];
  selectedIndex?: number;
  enabled?: boolean;
  onChange?: (event: {
    nativeEvent: { selectedSegmentIndex: number; value: string };
  }) => void;
  onValueChange?: (value: string) => void;
  tintColor?: string;
  appearance?: "dark" | "light";
  style?: unknown;
  testID?: string;
  children?: React.ReactNode;
};

const SegmentedControl = (props: MockProps): React.ReactElement => {
  const values = Array.isArray(props.values) ? props.values : [];
  return (
    <View testID={props.testID}>
      {values.map((value, index) => (
        <Pressable
          key={index}
          testID={`segment-${value}`}
          disabled={props.enabled === false}
          onPress={() => {
            props.onValueChange?.(value);
            props.onChange?.({
              nativeEvent: { selectedSegmentIndex: index, value },
            });
          }}
        >
          <Text>{value}</Text>
        </Pressable>
      ))}
      {props.children}
    </View>
  );
};

export default SegmentedControl;
export { SegmentedControl };