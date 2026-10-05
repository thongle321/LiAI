/** Context-full banner and the "More room" ladder (G1).
 *
 * A long thread exhausts the context window. PocketPal's answer is a
 * sticky banner with a fill meter and a recovery sheet
 * (`pocketpal-ai/src/components/ChatView/BannerRow.tsx:66-240`,
 * `IncreaseContextSheet.tsx:36-330`); we take the shape, not the code.
 *
 * **The banner reserves no space.** It renders in chat.tsx's overlay row,
 * which sits out of flow over the message list. Putting it inside
 * `MessageInput` instead would make it an in-flow row counted by the
 * measured composer height, and the list would reflow every time it
 * appeared — the bug documented at chat.tsx:96-102 and in
 * docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md §12.
 */

import { Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";

import { usePressFeedback } from "../../lib/motion.ts";

/** Context sizes offered by the ladder, ascending. Sized from the two
 *  bounds the inference store already declares (MIN_CONTEXT 512,
 *  DEFAULT_INFERENCE.nCtx 4096) rather than a second ladder of our own. */
const LADDER = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

export function ContextFullBanner({
  variant = "full",
  fill,
  onMoreRoom,
  onNewChat,
  onDismiss,
}: {
  /** "full" is the post-failure banner (unchanged); "warning" is the C4
   *  pre-failure alert — same surface, same actions, softer meter. */
  variant?: "full" | "warning";
  /** 0-100. */
  fill: number;
  onMoreRoom: () => void;
  onNewChat: () => void;
  onDismiss: () => void;
}) {
  const warning = variant === "warning";
  const moreRoom = usePressFeedback();
  const newChat = usePressFeedback();
  return (
    <View
      className={`mb-2 rounded-lg border p-3 ${
        warning ? "border-warning/30 bg-warning/10" : "border-border bg-surface-2"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-body-sm text-primary-text">
          {warning ? "Context running low" : "Context full"}
        </Text>
        <Text className="font-sans text-caption text-secondary-text">{fill}%</Text>
      </View>
      {/* The fill meter: the one thing that tells the user this is about
          room, not about the model being broken. The warning variant
          tints the whole card amber at the same lighter strength
          PocketPal gives its warning banner (BannerRow tint.warning), so
          "soon" and "now" are not the same surface. */}
      <View className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
        <View
          className={`h-full rounded-full ${warning ? "bg-warning" : "bg-error"}`}
          style={{ width: `${Math.max(2, fill)}%` }}
        />
      </View>
      <Text className="mt-2 font-sans text-caption text-secondary-text">
        {warning
          ? "This conversation is getting long and may soon run out of room."
          : "This thread has used the room the model has. Start a new chat, or give the model more."}
      </Text>
      <View className="mt-2 flex-row items-center gap-2">
        <AnimatedPress press={moreRoom} onPress={onMoreRoom} label="More room">
          <Text className="font-sans-semibold text-body-sm text-primary">
            More room
          </Text>
        </AnimatedPress>
        <AnimatedPress press={newChat} onPress={onNewChat} label="New chat">
          <Text className="font-sans-semibold text-body-sm text-primary">
            New chat
          </Text>
        </AnimatedPress>
        <Pressable
          onPress={onDismiss}
          className="ml-auto min-h-12 justify-center px-2"
          accessibilityRole="button"
          accessibilityLabel="Dismiss context warning"
        >
          <Text className="font-sans text-body-sm text-secondary-text">
            Dismiss
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The ladder. Picks a size and calls back; the caller applies it.
 *
 *  Deliberately shows SIZES ONLY. PocketPal's sheet also shows a RAM
 *  estimate and a fits/tight/won't-fit chip, but ours cannot honestly
 *  produce either: `ggufMetadata` is never populated, so
 *  `estimateModelMemory` would always fall back to a flat 1.2x multiplier
 *  and a confidence it does not have. See the fit-status correction in
 *  docs/specs/2026-09-29-chat-turn-signals-and-lifecycle.md §3.
 */
export function ContextLadderSheet({
  visible,
  currentNctx,
  onPick,
  onClose,
}: {
  visible: boolean;
  currentNctx: number;
  onPick: (nctx: number) => void;
  onClose: () => void;
}) {
  const press = usePressFeedback();
  if (!visible) return null;
  const options = LADDER.filter((n) => n > currentNctx);
  return (
    <View className="absolute inset-0 z-50 justify-end bg-black/30">
      <Pressable
        className="flex-1"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close context settings"
      />
      <View className="rounded-t-2xl border-t border-border bg-surface-1 p-5">
        <Text className="font-sans-semibold text-title text-primary-text">
          More room
        </Text>
        <Text className="mt-1 font-sans text-body-sm text-secondary-text">
          Raising the context reloads the model with more memory reserved. It
          starts from scratch, so it costs a moment and some RAM.
        </Text>
        {options.length === 0 ? (
          <Text className="mt-4 font-sans text-body-md text-secondary-text">
            This is already the largest size offered.
          </Text>
        ) : (
          <View className="mt-3">
            {options.map((n) => (
              <Pressable
                key={n}
                onPress={() => onPick(n)}
                onPressIn={press.onPressIn}
                onPressOut={press.onPressOut}
                className="min-h-12 flex-row items-center justify-between"
                accessibilityRole="button"
                accessibilityLabel={`Set context to ${n} tokens`}
              >
                <Text className="font-sans text-body-lg text-primary-text">
                  {n.toLocaleString()}
                </Text>
                <Text className="font-sans text-caption text-secondary-text">
                  tokens
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable
          onPress={onClose}
          className="btn btn--secondary mt-3 min-h-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text className="font-sans-semibold text-body-md text-primary">
            Close
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A pressable with the app's press feedback, for the banner's text
 *  actions. Extracted so both rows share one 48dp hit target. */
function AnimatedPress({
  press,
  onPress,
  label,
  children,
}: {
  press: ReturnType<typeof usePressFeedback>;
  onPress: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      className="min-h-12 justify-center px-2"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}