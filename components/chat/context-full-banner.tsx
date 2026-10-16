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
import { useEffect, useState, type ReactNode } from "react";

import { usePressFeedback } from "../../utils/motion.ts";
import {
  ESCALATED_AFTER_FAILURES,
  type BannerVariant,
  type ContextFullCopy,
} from "../../services/chat/banner-variant.ts";
import { useInference } from "../../store/inference.ts";
import { reloadLocalEngine } from "../../store/chat/index.ts";
import { useContextLadder } from "../../hooks/useContextLadder.ts";
import { labelTokens } from "../../services/chat/context-ladder.ts";
import { formatBytes } from "../models/model-bits.tsx";

/** One surface, five variants. `services/chat//banner-variant.ts` decides which
 *  of these renders and, for context-full, which wording — this component
 *  only draws it. PocketParity: ChatView/BannerRow.tsx. */
const COPY: Record<
  BannerVariant,
  { title: string; body: string; meter?: boolean }
> = {
  "context-full": {
    title: "Context full",
    body: "This thread has used the room the model has. Start a new chat, or give the model more.",
    meter: true,
  },
  "context-warning": {
    title: "Context running low",
    body: "This conversation is getting long and may soon run out of room.",
    meter: true,
  },
  "remote-cut-off": {
    title: "This reply may be cut off",
    body: "The remote model stopped mid-sentence. Ask it to carry on.",
  },
  "html-soft-cap": {
    title: "Previews are piling up",
    body: "This conversation has several HTML previews in it, which is part of why it feels slow.",
  },
  none: { title: "", body: "" },
};

/** The context-full wording, in the resolver's precedence order: remote
 *  first (raising the context size is not ours to offer), then the tool
 *  that needs the room, then the repeated-failure escalation, then the
 *  default the resolver already selected. */
function fullBody(
  copy: ContextFullCopy,
  heavyToolName: string | undefined,
): string {
  if (copy === "remote") {
    return "This remote model has run out of room. Start a new chat — there is no context size to raise here.";
  }
  if (copy === "heavy-tool") {
    return `${heavyToolName ?? "That tool"} takes a lot of room in this conversation. Start a new chat, or give the model more.`;
  }
  if (copy === "escalated") {
    return `This thread has run out of room ${ESCALATED_AFTER_FAILURES} turns in a row. Start a new chat, or give the model more.`;
  }
  return COPY["context-full"].body;
}

export function ContextFullBanner({
  variant = "context-full",
  copy,
  heavyToolName,
  fill,
  onMoreRoom,
  onNewChat,
  onDismiss,
  canIncrease: canIncreaseProp,
}: {
  /** Which variant the resolver chose. "full" is the post-failure banner;
   *  "warning" the C4 pre-failure alert — same surface, same actions,
   *  softer meter. */
  variant?: BannerVariant;
  /** context-full only: which wording to use. */
  copy?: ContextFullCopy;
  /** The heavy tool to name, when the copy names one. */
  heavyToolName?: string;
  /** 0-100. Read by the two window-driven variants only. */
  fill: number;
  onMoreRoom: () => void;
  onNewChat: () => void;
  onDismiss: () => void;
  /** Whether a larger size actually fits this device (the ladder's
   *  `anyFits`). Undefined keeps the local/remote rule below. */
  canIncrease?: boolean;
}) {
  // No `variant === "none"` early return: the hooks below are
  // unconditional by contract, and the caller only mounts a real variant.
  const warning = variant === "context-warning";
  const spec = COPY[variant];
  const moreRoom = usePressFeedback();
  const newChat = usePressFeedback();
  // "More room" is a local model control. A remote full banner says so
  // and offers the conversation instead, rather than a button that would
  // raise a setting the endpoint does not read. When the caller knows the
  // ladder — it has the fit classification — its verdict wins: a button
  // that leads to a picker with nothing in it is a dead end.
  const canIncrease =
    canIncreaseProp ??
    (variant === "context-warning" ||
      (variant === "context-full" && copy !== "remote"));
  return (
    <View
      className={`mb-2 rounded-lg border p-3 ${
        warning ? "border-warning/30 bg-warning/10" : "border-border bg-surface-2"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-body-sm text-primary-text">
          {spec.title}
        </Text>
        {spec.meter === true ? (
          <Text className="font-sans text-caption text-secondary-text">{fill}%</Text>
        ) : null}
      </View>
      {/* The fill meter: the one thing that tells the user this is about
          room, not about the model being broken. The warning variant
          tints the whole card amber at the same lighter strength
          PocketPal gives its warning banner (BannerRow tint.warning), so
          "soon" and "now" are not the same surface. */}
      {spec.meter === true ? (
        <View className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
          <View
            className={`h-full rounded-full ${warning ? "bg-warning" : "bg-error"}`}
            style={{ width: `${Math.max(2, fill)}%` }}
          />
        </View>
      ) : null}
      <Text className="mt-2 font-sans text-caption text-secondary-text">
        {variant === "context-full" ? fullBody(copy ?? "default", heavyToolName) : spec.body}
      </Text>
      <View className="mt-2 flex-row items-center gap-2">
        {canIncrease ? (
          <AnimatedPress press={moreRoom} onPress={onMoreRoom} label="More room">
            <Text className="font-sans-semibold text-body-sm text-primary">
              More room
            </Text>
          </AnimatedPress>
        ) : null}
        {variant !== "html-soft-cap" ? (
          <AnimatedPress press={newChat} onPress={onNewChat} label="New chat">
            <Text className="font-sans-semibold text-body-sm text-primary">
              New chat
            </Text>
          </AnimatedPress>
        ) : null}
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

/** The ladder sheet: pick a larger size, confirm, the model reloads.
 *
 *  The stops, their labels, their memory cost and their fit for this
 *  device are pure (services/chat//context-ladder.ts, via hooks/useContextLadder.ts);
 *  this draws them and owns the reload. PocketParity:
 *  IncreaseContextSheet.tsx.
 *
 *  Confirm reloads the model AT ONCE rather than leaving it to the next
 *  turn, so a size the device cannot actually load is discovered here,
 *  while there is still a way out of the sheet.
 */
export function ContextLadderSheet({
  visible,
  currentNctx,
  onClose,
  onResult,
  onNewChat,
}: {
  visible: boolean;
  currentNctx: number;
  onClose: () => void;
  /** Reported after the reload settles, so the caller can say so. */
  onResult: (success: boolean, tokens: number) => void;
  onNewChat: () => void;
}) {
  const { stops, anyFits, defaultIndex, modelMaxNCtx } =
    useContextLadder(currentNctx);
  const setNCtx = useInference((s) => s.setNCtx);
  const liveNCtx = useInference((s) => s.nCtx);
  const press = usePressFeedback();
  const [pick, setPick] = useState(0);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (visible) setPick(defaultIndex);
  }, [visible, defaultIndex]);

  const confirm = async () => {
    const chosen = stops[Math.min(pick, stops.length - 1)];
    if (!chosen || reloading) return;
    const previousNCtx = liveNCtx;
    setReloading(true);
    onClose();
    setNCtx(chosen.tokens);
    try {
      await reloadLocalEngine();
      onResult(true, chosen.tokens);
    } catch {
      // ensure() drops the slot before it loads, so the model is unloaded
      // here. Put the size back AND load it back: the end state must be a
      // loaded model at the previous size, not an empty slot.
      setNCtx(previousNCtx);
      try {
        await reloadLocalEngine();
      } catch {
        // Swallowed on purpose: a second failure must not hide the
        // new-chat action, which is the only way forward left.
      }
      onResult(false, chosen.tokens);
    } finally {
      setReloading(false);
    }
  };

  if (!visible) return null;
  const chosen = stops[Math.min(pick, stops.length - 1)];
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
          Reloading takes a few seconds and nothing in this chat is lost — the
          model just gets more room to work in.
        </Text>
        {anyFits === false ? (
          <View className="mt-4">
            <Text className="font-sans text-body-md text-secondary-text">
              No larger size fits this device, so there is nothing to raise it
              to. A new chat gives the model its room back.
            </Text>
            <Pressable
              onPress={() => {
                onNewChat();
                onClose();
              }}
              onPressIn={press.onPressIn}
              onPressOut={press.onPressOut}
              className="btn btn--primary mt-4 min-h-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
            >
              <Text className="font-sans-semibold text-body-md text-primary">
                New chat
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="mt-3">
              {stops.map((stop, i) => {
                const selected = i === Math.min(pick, stops.length - 1);
                // One chip per stop, tinted by what THIS device can do with
                // it — the whole point of the ladder.
                const fitClass =
                  stop.fit === "fits"
                    ? "border-success/40 bg-success/10 text-success"
                    : stop.fit === "tight"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-error/40 bg-error/10 text-error";
                return (
                  <Pressable
                    key={stop.tokens}
                    onPress={() => setPick(i)}
                    onPressIn={press.onPressIn}
                    onPressOut={press.onPressOut}
                    className="min-h-12 flex-row items-center justify-between border-b border-border/60 py-2"
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${stop.label} context, ${fitLabel(stop.fit)}`}
                  >
                    <View>
                      <Text
                        className={`font-sans text-body-lg ${selected ? "text-primary" : "text-primary-text"}`}
                      >
                        {stop.label}
                      </Text>
                      <Text className="font-sans text-caption text-secondary-text">
                        {`~${stop.words.toLocaleString()} words · ${formatBytes(stop.memBytes)}`}
                      </Text>
                    </View>
                    <View
                      className={`rounded-full border px-2 py-1 ${fitClass}`}
                    >
                      <Text className="font-sans-semibold text-caption">
                        {fitLabel(stop.fit)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-2 font-sans text-caption text-secondary-text">
              {`This model was trained for up to ${labelTokens(modelMaxNCtx)} tokens.`}
            </Text>
            <Pressable
              onPress={() => void confirm()}
              disabled={reloading || chosen?.fit === "wont_fit"}
              className="btn btn--primary mt-4 min-h-12 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={`Reload at ${chosen?.label ?? ""} context`}
            >
              <Text className="font-sans-semibold text-body-md text-primary">
                {reloading
                  ? "Reloading…"
                  : `Confirm ${chosen?.label ?? ""}`}
              </Text>
            </Pressable>
          </>
        )}
        <Pressable
          onPress={onClose}
          disabled={reloading}
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

/** The chip word for a fit classification. */
function fitLabel(fit: "fits" | "tight" | "wont_fit"): string {
  return fit === "fits" ? "Fits" : fit === "tight" ? "Tight" : "Won't fit";
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