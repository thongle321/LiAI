/** Message list item: user card and assistant turn (markdown + tool chips
 * + footer) — one row, either role.
 *
 * Renamed from Bubble.tsx (message-view refactor): same behavior, new
 * name. Assistant text renders through MarkdownView; streaming replies
 * re-parse per token chunk.
 *
 * Row shape is PocketPal's (Message.tsx, Bubble.tsx, styles.ts): a width
 * measured once by the list and threaded down, an assistant turn with no
 * furniture at all — no avatar, no name, no fill — and a footer carrying
 * only speak, copy and timings. Their Avatar returns null for assistant
 * rows and their sender name is off by default, so their assistant row is
 * bare text on the page; ours now is too.
 */

import { ActivityIndicator, Image as RNImage, Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";
import { memo, useState } from "react";
import Animated from "react-native-reanimated";
import { CheckCheck, CircleAlert, Wrench } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { formatTime, formatToolMetrics } from "../../lib/format.ts";
import {
  MOTION_DURATION_MS,
  bubbleEntering,
  fadeExiting,
} from "../../lib/motion.ts";
import type { MessageRow } from "../../lib/chat/rows.ts";
import { blocksOf, turnText } from "../../lib/chat/blocks.ts";
import type { AgentStep } from "../../types/chat.ts";
import { MarkdownView } from "./MarkdownView.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { LinkPreviewCard } from "./LinkPreview.tsx";
import { ReasoningBlock } from "./ReasoningBlock.tsx";
import { MessageMenu } from "./MessageMenu.tsx";
import { ToolErrorBlock } from "./ToolErrorBlock.tsx";
import { ToolMetricsLine, toolSurfaceFor } from "./toolSurfaces.tsx";
import { ImageViewer } from "./ImageViewer.tsx";
import type { PickableModel } from "../../lib/chat/models.ts";
import type { MessageWidths } from "../../lib/chat/message-width.ts";

/** One tool block, as a SIBLING of the text bubbles — never nested in
 * one. THREE-WAY DISPATCH, in this order (G5):
 *   1. a recorded FAILURE -> error block
 *   2. a registered renderer for this tool name -> its surface
 *   3. otherwise -> the "used X" chip
 * An error must NEVER fall through to the chip or a renderer: that is
 * how a failed tool came to look like a successful one.
 *
 * `ok === false` SPECIFICALLY. Undefined means "never recorded" -- a
 * row written before the discriminant -- and that is not a failure. */
function ToolBlock({ step }: { step: AgentStep }) {
  if (step.ok === false) {
    return (
      <View className="w-full">
        <ToolErrorBlock tool={step.tool} message={step.result ?? ""} />
        {/* C15: cost belongs under the RESULT, not in the turn footer —
            per-tool cost must be attributable. */}
        <ToolMetricsLine metrics={step.metrics} />
      </View>
    );
  }
  const Renderer = toolSurfaceFor(step.tool);
  if (Renderer !== undefined) {
    // No expanded/onToggle here: a surface owns its own open/closed
    // state and renders it as a collapsed row plus a sheet, exactly as
    // pocketpal does. Keeping the flag in the bubble would make the
    // bubble responsible for something it cannot see.
    return (
      <View className="w-full">
        <Renderer step={step} />
      </View>
    );
  }
  const metricsText = formatToolMetrics(step.metrics);
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full border border-border bg-surface-2 px-2 py-0.5">
      <Wrench size={11} color={colors.secondaryText} />
      <Text className="font-sans text-caption text-secondary-text">
        {/* PocketPal's chip reads "Used {{name}}" (ToolUsedChip.tsx:53-66),
            so the reader can tell a tool ran from a label that just names
            one. Their metrics suffix is the same " · 1,500 tokens · 35s"
            our formatToolMetrics already produces. */}
        Used {step.tool}
        {metricsText === null ? "" : ` · ${metricsText}`}
      </Text>
    </View>
  );
}

export const MessageListItem = memo(function MessageListItem({
  row,
  onRegenerate,
  onEdit,
  onRegenerateWith,
  canRun,
  models,
  widths,
  contextBannerVisible,
}: {
  /** One adapter row: message plus its group/status flags. */
  row: MessageRow;
  /** Null for user bubbles (nothing to regenerate). Take the message id
   *  rather than closing over it: the screen's handlers are stable
   *  (useCallback), so a keyboard toggle — which re-renders the screen —
   *  re-creates no prop identity here and this row can bail out. A
   *  per-row arrow would re-render every visible row instead, which is
   *  the jank half of the keyboard flash. */
  onRegenerate: ((messageId: string) => void) | null;
  /** Enter edit mode on this turn. Only reachable from a user bubble. */
  onEdit: (messageId: string) => void;
  /** Re-answer this turn with a different model. */
  onRegenerateWith: (messageId: string, modelId: string) => void;
  /** A model is loaded: regenerate and edit both start a turn. */
  canRun: boolean;
  /** Models offered by "Regenerate with…". */
  models: PickableModel[];
  /** The list's one width measurement, threaded down (PocketParity).
   *  A percentage cannot work here — see lib/chat/message-width.ts. */
  widths: MessageWidths;
  /** A context-full banner is on screen for this conversation, so the
   *  turn footer must not repeat what it already says. */
  contextBannerVisible?: boolean;
}) {
  const { message, grouped, status } = row;
  const duration = MOTION_DURATION_MS;
  const entering = bubbleEntering(duration);
  const exiting = fadeExiting(duration);
  // Previews and actions target settled turns: a half-streamed URL would
  // trigger a garbage preview fetch, and actions need final text.
  const settled = message.streaming !== true;
  // Copy and read-aloud always mean the whole reply, never one segment.
  const wholeText = turnText(message);
  // The row renders as sibling blocks in the order the model produced
  // them. A turn written by the previous model reads through the
  // splitter, so its reasoning, whole reply and tools land the same way.
  const blocks = blocksOf(message);
  const stepById = new Map((message.steps ?? []).map((s) => [s.id, s]));
  // Which attached photo is open, or null. The image sits OUTSIDE
  // withMenu, so tapping it opens the viewer while the bubble's own
  // long-press still opens the menu.
  //
  // The honest tradeoff: a long-press ON THE PHOTO itself does nothing --
  // neither menu nor zoom. That is deliberate. Nesting the image in the
  // menu would hand the gesture to the menu and cost the tap-to-enlarge
  // this exists for, and a long-press on a photo is far more likely to
  // mean "I want the menu" than "I want to zoom" -- which is the same
  // reason PocketPal's own image path is a tap.
  const [enlarged, setEnlarged] = useState<string | null>(null);
  // Both bubbles wrap in the same menu and only the bubble inside differs.
  // One definition, so the two call sites cannot drift apart.
  // The menu's API stays no-arg/model-id-only: binding the row's id to
  // the screen's stable handlers happens here, so the arrows are recreated
  // only when THIS row re-renders (row change), not on every screen render.
  const withMenu = (bubble: ReactNode) => (
    <MessageMenu
      text={wholeText}
      settled={settled}
      role={message.role}
      canRun={canRun}
      models={models}
      onRegenerate={
        onRegenerate === null ? undefined : () => onRegenerate(message.id)
      }
      onEdit={() => onEdit(message.id)}
      onRegenerateWith={(modelId) => onRegenerateWith(message.id, modelId)}
    >
      {bubble}
    </MessageMenu>
  );
  if (message.role === "user") {
    return (
      <>
        <Animated.View
          entering={entering}
          exiting={exiting}
          className={grouped ? "mb-1 self-end items-end" : "mb-4 self-end items-end"}
          style={{ maxWidth: widths.user }}
        >
            {message.images !== undefined && message.images.length > 0 && (
            // G8: one row of up to five, each independently tappable. Keyed
            // by position plus length: the list only ever shrinks, so a
            // content hash would be a re-render cost for nothing.
            <View className="mb-1 flex-row flex-wrap gap-1">
              {message.images.map((uri, i) => (
                <Pressable
                    key={`${i}-${uri.length}`}
                    onPress={() => setEnlarged(uri)}
                    accessibilityRole="button"
                    accessibilityLabel="Enlarge attached photo"
                    accessibilityHint="Opens the photo full screen"
                >
                    <RNImage source={{ uri }} className="h-[120px] w-40 rounded-xl" />
                </Pressable>
              ))}
            </View>
          )}
          {/* No tail: PocketPal passes roundBorder hard-coded true, so its
              bubbles have all four corners rounded and the tail its styles
              describe never actually renders. */}
          {withMenu(
            <View className="rounded-xl bg-surface-3 px-5 py-3">
              <Text className="font-sans text-body-lg text-primary-text">
                {message.text}
              </Text>
            </View>,
          )}
          <View className="w-full">
            <LinkPreviewCard text={message.text} />
          </View>
          {/* Time + status once per group: repeating them on every
              grouped turn is visual noise. */}
          {!grouped && (
            <View className="mt-1 flex-row items-center">
              <Text className="font-sans text-caption text-secondary-text">
                {formatTime(message.at)}
              </Text>
              {/* Three states, one row. The error icon is the row's own
                  record that this question never landed; the reason and
                  its retry live in the snackbar, not on the row. */}
              {status === "sending" ? (
                <ActivityIndicator size="small" color={colors.secondaryText} />
              ) : status === "failed" ? (
                <CircleAlert
                  size={12}
                  color={colors.error}
                  accessibilityLabel="Failed to send"
                />
              ) : (
                <CheckCheck size={12} color={colors.secondaryText} />
              )}
            </View>
          )}
        </Animated.View>
        <ImageViewer uri={enlarged} onClose={() => setEnlarged(null)} />
      </>
    );
  }
  return (
    // The list's ONE measured width, threaded down — not a percentage.
    // `self-start` + `max-w-[75%]` shrink-wrapped this row to the content's
    // intrinsic width and the viewport clipped it instead of wrapping;
    // see lib/chat/message-width.ts. Vertical rhythm is PocketPal's
    // (styles.ts:24-32): 4px within a group, 16px between groups.
    <Animated.View
      entering={entering}
      exiting={exiting}
      className={grouped ? "mb-1" : "mb-4"}
      style={{ maxWidth: widths.assistant }}
    >
      {withMenu(
        <View className="gap-2">
          {blocks.map((block, index) => {
            if (block.kind === "reasoning") {
              return (
                <ReasoningBlock
                  key={`reasoning-${index}`}
                  text={block.text}
                  maxWidth={widths.assistant}
                  autoCollapse={settled || wholeText.trim() !== ""}
                />
              );
            }
            if (block.kind === "text") {
              // No fill, no border, no radius: PocketPal's assistant
              // bubble is `backgroundColor: 'transparent'` with a radius
              // that only exists to clip the tool surfaces inside it. The
              // vertical inset is theirs (insets.messageInsetsVertical:
              // 10); the horizontal one is 0, because the list's own p-5
              // already sets the text's left edge.
              return (
                <View key={`text-${index}`} className="py-2.5">
                  <MarkdownView text={block.text} maxWidth={widths.assistant} />
                  {settled && <LinkPreviewCard text={block.text} />}
                </View>
              );
            }
            // A tool block resolves to its step by id; a dangling
            // reference (a step the store skipped) renders nothing
            // rather than guessing a surface.
            const step = stepById.get(block.stepId);
            if (step === undefined) return null;
            return <ToolBlock key={step.id} step={step} />;
          })}
        </View>,
      )}
      {settled && (
        <MessageActions
          text={wholeText}
          outcome={message.outcome}
          contextBannerVisible={contextBannerVisible}
        />
      )}
    </Animated.View>
  );
});
