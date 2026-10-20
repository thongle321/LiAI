/** Reasoning block above an assistant answer (Q7=B).
 *
 * PocketPal's ThinkingBubble + ReasoningBlock replica, on LiAI tokens:
 * the block starts PARTIAL (a 150px card with a fade over its bottom),
 * tapping it cycles COLLAPSED → PARTIAL → EXPANDED, and once the answer
 * starts it auto-collapses to a compact "Reasoning" row — unless the
 * user has already tapped, whose choice then wins.
 *
 * The fade is a react-native-svg gradient drawn OVER the content
 * (transparent → card background): no MaskedView/LinearGradient
 * dependency, same look.
 */

import { useEffect, useRef, useState } from "react";
import { InteractionManager, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ChevronDown, ChevronRight } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { MOTION_DURATION_MS, motionLayout } from "@/utils/motion.ts";
import { MarkdownView } from "./markdown-view.tsx";

type BubbleState = "collapsed" | "partial" | "expanded";

const CYCLE: Record<BubbleState, BubbleState> = {
  collapsed: "partial",
  partial: "expanded",
  expanded: "collapsed",
};

const AnimatedChevron = Animated.createAnimatedComponent(ChevronDown);

export function ReasoningBlock({
  text,
  autoCollapse = false,
  maxWidth,
}: {
  text: string;
  autoCollapse?: boolean;
  /** The turn's measured width, so the reasoning body wraps like the
   *  reply does. Reasoning is often the longest text in a turn, so
   *  leaving it unconstrained brings back the intrinsic-width overflow
   *  the list's width threading exists to prevent. */
  maxWidth?: number;
}) {
  const colors = useColors();
  const [state, setState] = useState<BubbleState>("partial");
  const userToggledRef = useRef(false);
  const rotation = useSharedValue(90);

  // Rising edge only: once the answer starts, snap to the compact row —
  // but never over a choice the user already made. Defer the state flip
  // past the in-flight interaction so a streaming tail doesn't fight the
  // layout settle (PocketPal's InteractionManager.runAfterInteractions).
  useEffect(() => {
    if (autoCollapse && !userToggledRef.current) {
      InteractionManager.runAfterInteractions(() => {
        if (!userToggledRef.current) setState("collapsed");
      });
    }
  }, [autoCollapse]);

  useEffect(() => {
    rotation.value = withTiming(state === "expanded" ? 180 : 90, {
      duration: MOTION_DURATION_MS,
    });
  }, [state, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (text.trim() === "") return null;

  const onPress = (): void => {
    userToggledRef.current = true;
    setState((s) => CYCLE[s]);
  };

  if (state === "collapsed") {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Show reasoning"
        className="mt-1.5 flex-row items-center gap-1.5 self-start px-1 py-1"
      >
        <ChevronRight size={12} color={colors.secondaryText} />
        <Text className="text-quiet">Reasoning</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Toggle reasoning"
      className="my-1.5 overflow-hidden rounded-2xl border border-border bg-surface-3"
    >
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text className="font-sans text-body-sm tracking-[0.5px] text-primary-text">
          Reasoning
        </Text>
        <View className="h-7 w-7 items-center justify-center rounded-full border border-border">
          <AnimatedChevron size={18} color={colors.secondaryText} style={chevronStyle} />
        </View>
      </View>
      <Animated.View
        layout={motionLayout()}
        className={
          state === "partial" ? "h-[150px] overflow-hidden px-4 pb-4" : "px-4 pb-4"
        }
      >
        <MarkdownView text={text} dense maxWidth={maxWidth} />
        {state === "partial" ? (
          <Svg
            pointerEvents="none"
            width="100%"
            height={40}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
          >
            <Defs>
              <LinearGradient id="reasoningFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.surface3} stopOpacity="0" />
                <Stop offset="1" stopColor={colors.surface3} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="40" fill="url(#reasoningFade)" />
          </Svg>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
