/** Jest stub for `@expo/ui/community/menu`.
 *
 * The real module mounts native SwiftUI / Jetpack Compose menus, which do not
 * exist under Jest. This stub renders the trigger children and one pressable
 * per action so that dispatch logic (onPressAction -> event.nativeEvent.event)
 * can be exercised without a device.
 *
 * It mirrors the three behaviours the component actually depends on:
 *   - the trigger fires `onOpenMenu` on long-press (or tap when
 *     `shouldOpenOnLongPress` is off), exactly like both platform files;
 *   - `attributes.disabled` reaches the pressable, so a disabled item really
 *     cannot be pressed;
 *   - `state: "on"` renders the ✓ the Android implementation draws.
 *
 * One deliberate infidelity: `subactions` are flattened into the same
 * pressable list as their parent, because Jest cannot reach inside a native
 * nested menu. That is what makes the model-picking branch testable.
 * `displayInline` is not modelled: no caller uses it yet, and guessing the
 * layout would make the stub lie about a menu nobody renders.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";

type MockAction = {
  id?: string;
  title: string;
  attributes?: { disabled?: boolean; hidden?: boolean };
  subactions?: MockAction[];
  state?: "on" | "off";
};

type MockMenuProps = {
  actions?: MockAction[];
  onPressAction?: (event: { nativeEvent: { event: string } }) => void;
  onOpenMenu?: () => void;
  shouldOpenOnLongPress?: boolean;
  testID?: string;
  children?: React.ReactNode;
};

/** The real module's public action type, as far as this stub needs it. */
export type MenuAction = MockAction;

function flatten(actions: MockAction[]): MockAction[] {
  const out: MockAction[] = [];
  for (const action of actions) {
    out.push(action);
    if (Array.isArray(action.subactions)) out.push(...flatten(action.subactions));
  }
  return out;
}

const MenuView = React.forwardRef<{ show: () => void }, MockMenuProps>(
  (props, ref) => {
    React.useImperativeHandle(ref, () => ({
      show: () => {
        props.onOpenMenu?.();
      },
    }));

    const open = () => {
      props.onOpenMenu?.();
    };
    const actions = Array.isArray(props.actions) ? props.actions : [];

    return (
      <View testID={props.testID}>
        <Pressable
          testID="menu-trigger"
          onLongPress={props.shouldOpenOnLongPress ? open : undefined}
          onPress={props.shouldOpenOnLongPress ? undefined : open}
        >
          {props.children}
        </Pressable>
        {flatten(actions)
          .filter((action) => action.attributes?.hidden !== true)
          .map((action) => {
            const id = action.id ?? action.title;
            return (
              <Pressable
                key={id}
                testID={`menu-action-${id}`}
                accessibilityLabel={action.title}
                disabled={action.attributes?.disabled === true}
                onPress={() =>
                  props.onPressAction?.({ nativeEvent: { event: id } })
                }
              >
                <Text>{action.title}</Text>
                {action.state === "on" && <Text>✓</Text>}
              </Pressable>
            );
          })}
      </View>
    );
  },
);
MenuView.displayName = "MenuView";

export default MenuView;
