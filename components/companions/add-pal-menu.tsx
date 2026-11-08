/** AddPalMenu: anchored dropdown for the "New Companion" button.
 *
 *  PocketPal uses a Paper Menu anchored to the FAB. LiAI uses a Modal
 *  anchored via measureInWindow (same pattern as chat-menu.tsx) with
 *  MenuRow items. Two templates: Assistant and Roleplay (no video).
 *
 *  Render prop pattern: the child receives `{ onPress, ref }` and renders
 *  the trigger button. This keeps the trigger's ref inside the menu so
 *  measureInWindow works without the caller managing it.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  Text,
  View,
  type ViewInstance,
} from "react-native";
import { Drama, Bot } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { usePressFeedback } from "@/utils/motion.ts";
import type { Companion } from "@/types/companion.ts";

interface TriggerRenderProps {
  onPress: () => void;
  ref: React.RefObject<ViewInstance | null>;
}

export interface AddPalMenuProps {
  /** Called with the chosen template when the user picks one. */
  onCreate: (template: Partial<Companion>) => void;
  /** Whether the menu is currently open. */
  isOpen: boolean;
  /** Called when the menu should open/close. */
  onToggle: (open: boolean) => void;
  /** Render prop for the trigger button. Receives `{ onPress, ref }`. */
  children: (props: TriggerRenderProps) => React.ReactNode;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  template: Partial<Companion>;
}

export function AddPalMenu({
  onCreate,
  isOpen,
  onToggle,
  children,
}: AddPalMenuProps) {
  const colors = useColors();
  const triggerPress = usePressFeedback();
  const triggerRef = useRef<ViewInstance | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const items: MenuItem[] = [
    {
      label: "Assistant",
      icon: <Bot size={20} color={colors.primaryText} />,
      template: { type: "local", name: "", systemPrompt: "", parameterSchema: [] },
    },
    {
      label: "Roleplay",
      icon: <Drama size={20} color={colors.primaryText} />,
      template: { type: "local", name: "", systemPrompt: "", parameterSchema: [] },
    },
  ];

  function close(): void {
    onToggle(false);
  }

  function open(): void {
    Keyboard.dismiss();
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const screenWidth = Dimensions.get("window").width;
      setAnchor({ top: y + h + 4, right: Math.max(8, screenWidth - (x + w)) });
      onToggle(true);
    });
  }

  useEffect(() => {
    if (isOpen) open();
  }, [isOpen]);

  function run(template: Partial<Companion>): void {
    onCreate(template);
    close();
  }

  const triggerProps: TriggerRenderProps = {
    onPress: open,
    ref: triggerRef,
  };

  return (
    <>
      {children(triggerProps)}
      {isOpen && anchor ? (
        <Modal
          transparent
          visible={isOpen}
          onRequestClose={close}
          animationType="none"
        >
          {/* Scrim */}
          <Pressable onPress={close} className="flex-1" />
          {/* Panel */}
          <View
            style={{
              position: "absolute",
              top: anchor.top,
              right: anchor.right,
              minWidth: 180,
            }}
            testID="add-pal-menu"
          >
            <View className="rounded-lg border border-border bg-surface-1 overflow-hidden">
              {items.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => run(item.template)}
                  className="menu-row flex-row items-center px-4 py-3"
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View className="w-5 items-center">{item.icon}</View>
                  <Text className="flex-1 font-sans text-body-lg text-primary-text">
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}