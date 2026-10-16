/** Floating action button + its three add-model actions. */

import { useEffect, useState } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import Animated, {
  type BaseAnimationBuilder,
} from "react-native-reanimated";
import type { LucideIcon } from "lucide-react-native";
import { Cloud, FolderPlus, Plus, Search, X } from "lucide-react-native";

import {
  ACTION_DURATION_MS,
  ACTION_STAGGER_MS,
  MENU_DURATION_MS,
  fabActionEntering,
  fabActionExiting,
  fadeEntering,
  fadeExiting,
} from "../../utils/motion.ts";
import { colors } from "../../themes/tokens.ts";

// Reanimated ships no animated Pressable; the backdrop needs to be one so
// its fade and its tap-to-dismiss live on the same view.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FabAction({
  Icon,
  label,
  onPress,
  entering,
  exiting,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  entering: BaseAnimationBuilder;
  exiting: BaseAnimationBuilder;
}) {
  // One row, one reveal: the pill and the circle rise and fade together.
  // `entering` fires on mount and `exiting` plays on unmount, so the motion
  // cannot start before the row exists.
  return (
    <Animated.View entering={entering} exiting={exiting}>
      <Pressable
        onPress={onPress}
        className="min-h-12 flex-row items-center gap-2 mb-3"
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View className="px-3 py-2 bg-surface-1 border border-border rounded">
          <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
        </View>
        <View className="h-10 w-10 rounded-full bg-surface-3 items-center justify-center">
          <Icon size={18} color={colors.primary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Height the expanded FAB stack occupies above the bottom of the screen.
 *
 * Three FabActions (48px target + 12px margin each) plus the 56px trigger,
 * plus the 20px bottom anchor. The models scroll reserves exactly this so
 * the last card is never trapped under the stack.
 */
export const FAB_STACK_HEIGHT = 20 + 56 + 3 * (48 + 12);

export function FABGroup({
  onAddHFModel,
  onAddLocalModel,
  onAddRemoteModel,
}: {
  onAddHFModel: () => void;
  onAddLocalModel: () => void;
  onAddRemoteModel: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Android Back consumes the INNERMOST transient layer first. Without this
  // the open menu left the screen entirely — Back popped the models route
  // with the FAB still expanded over the next one. Returning true claims
  // the event; the listener exists only while the menu is open, so Back
  // keeps its normal meaning the rest of the time.
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setOpen(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [open]);
  // PocketPal parity: the group always plays, ignoring the OS reduce-motion
  // setting (paper hardcodes its durations the same way).
  const actionMs = ACTION_DURATION_MS;
  const backdropInMs = MENU_DURATION_MS;
  const backdropOutMs = 200;

  function run(action: () => void): void {
    setOpen(false);
    action();
  }

  const actions = [
    { Icon: Search, label: "Add from Hugging Face", onPress: () => run(onAddHFModel) },
    { Icon: FolderPlus, label: "Add local model", onPress: () => run(onAddLocalModel) },
    { Icon: Cloud, label: "Add from API", onPress: () => run(onAddRemoteModel) },
  ];

  return (
    // Full-screen layer so the backdrop can cover the models screen. box-none
    // keeps the list underneath scrollable and tappable while the menu is shut.
    <View className="absolute inset-0" pointerEvents="box-none">
      {/* PocketPal parity: FAB.Group's backdropColor is theme surface
          (#F9FAFB) — the open group whites the screen out instead of dimming
          it. colors.base is our matching near-white. Mounts with `open`, so
          the fade-in starts with the mount; the fade-out plays on unmount. */}
      {open && (
        <AnimatedPressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss add model menu"
          className="absolute inset-0"
          entering={fadeEntering(backdropInMs)}
          exiting={fadeExiting(backdropOutMs)}
          style={{ backgroundColor: colors.base }}
        />
      )}
      {/* SAFETY: runtime-anchored position, unchanged from before the reveal.
          The models route is pushed with no tab bar, so its SafeAreaView
          already owns the bottom inset — adding insets.bottom here would apply
          that edge twice (DESIGN.md: insets are applied exactly once, by the
          component that owns the edge). Right/bottom stay inline because a
          className offset failed to resolve on device here once. */}
      <View
        className="items-end"
        style={{ position: "absolute", right: 20, bottom: 20 }}
      >
        {/* In flow, exactly where the old always-mounted block sat: the
            container is bottom-anchored, so these rows can never move the
            FAB, and an in-flow child is the only shape whose shrink-to-fit
            width matches the original (an absolute one collapsed the pills).
            Rows mount with `open` — staggered entering on the way in,
            parallel fade on the way out — and unmount when it finishes. */}
        {open && (
          <View className="items-end">
            {actions.map((action, index) => (
              <FabAction
                key={action.label}
                Icon={action.Icon}
                label={action.label}
                onPress={action.onPress}
                entering={fabActionEntering(
                  actionMs,
                  ACTION_STAGGER_MS * (actions.length - 1 - index),
                )}
                exiting={fabActionExiting(actionMs)}
              />
            ))}
          </View>
        )}
      {/* Icon button: fully circular is permitted because this is a thing
          you press. 56px well, 40px visual circle per DESIGN.md; no shadow
          — the hairline ring is the only separation. */}
      <Pressable
        onPress={() => setOpen(!open)}
        className="h-14 w-14 items-center justify-center rounded-full"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? "Close add model menu" : "Add a model"}
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-full border ${
            open ? "border-primary bg-surface-3" : "border-primary bg-primary"
          }`}
        >
          {open ? (
            <X size={20} color={colors.primary} />
          ) : (
            <Plus size={20} color={colors.onPrimary} />
          )}
        </View>
      </Pressable>
      </View>
    </View>
  );
}
