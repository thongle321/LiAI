/** Message list item: user card, assistant card (markdown + tool chips +
 * actions), and the tap-to-retry error card — one row, either role.
 *
 * Renamed from Bubble.tsx (message-view refactor): same behavior, new
 * name. Assistant text renders through MarkdownView; streaming replies
 * re-parse per token chunk.
 */

import { ActivityIndicator, Image as RNImage, Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useState } from "react";
import Animated from "react-native-reanimated";
import { CheckCheck, CircleAlert, Wrench } from "lucide-react-native";

import { APP_NAME } from "../../constants/app.ts";

// Reanimated v4 ships View/Text/Image/ScrollView only — Pressable
// goes through the builtin factory instead of a hand-rolled wrapper.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

import { colors } from "../../themes/tokens.ts";
import { formatTime, formatToolMetrics } from "../../lib/format.ts";
import {
  MOTION_DURATION_MS,
  bubbleEntering,
  fadeExiting,
  usePressFeedback,
} from "../../lib/motion.ts";
import type { MessageRow } from "../../lib/chat/rows.ts";
import { AssistantAvatar } from "./AssistantAvatar.tsx";
import { MarkdownView } from "./MarkdownView.tsx";
import { MessageActions } from "./MessageActions.tsx";
import { LinkPreviewCard } from "./LinkPreview.tsx";
import { ReasoningBlock } from "./ReasoningBlock.tsx";
import { MessageMenu } from "./MessageMenu.tsx";
import { ToolErrorBlock } from "./ToolErrorBlock.tsx";
import { ToolMetricsLine, toolSurfaceFor } from "./toolSurfaces.tsx";
import { ImageViewer } from "./ImageViewer.tsx";
import type { PickableModel } from "../../lib/chat/models.ts";

export function MessageListItem({
  row,
  onRetry,
  onRegenerate,
  onEdit,
  onRegenerateWith,
  canRun,
  models,
  contextBannerVisible,
}: {
  /** One adapter row: message plus its group/avatar/status flags. */
  row: MessageRow;
  onRetry: () => void;
  /** Null for user bubbles (nothing to regenerate). */
  onRegenerate: (() => void) | null;
  /** Enter edit mode on this turn. Only reachable from a user bubble. */
  onEdit: () => void;
  /** Re-answer this turn with a different model. */
  onRegenerateWith: (modelId: string) => void;
  /** A model is loaded: regenerate and edit both start a turn. */
  canRun: boolean;
  /** Models offered by "Regenerate with…". */
  models: PickableModel[];
  /** A context-full banner is on screen for this conversation, so the
   *  turn footer must not repeat what it already says. */
  contextBannerVisible?: boolean;
}) {
  const { message, grouped, showAvatar, status } = row;
  const duration = MOTION_DURATION_MS;
  const entering = bubbleEntering(duration);
  const exiting = fadeExiting(duration);
  const press = usePressFeedback();
  // Previews and actions target settled turns: a half-streamed URL would
  // trigger a garbage preview fetch, and actions need final text.
  const settled = message.streaming !== true;
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
  const withMenu = (bubble: ReactNode) => (
    <MessageMenu
      text={message.text}
      settled={settled}
      role={message.role}
      canRun={canRun}
      models={models}
      onRegenerate={onRegenerate ?? undefined}
      onEdit={onEdit}
      onRegenerateWith={onRegenerateWith}
    >
      {bubble}
    </MessageMenu>
  );
  if (message.error) {
    return (
      <AnimatedPressable
        entering={entering}
        exiting={exiting}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onRetry}
        style={press.animatedStyle}
        className="card card--error self-start max-w-[80%] my-1"
      >
        <Text className="font-sans text-body-lg text-primary-text">
          {message.text}
        </Text>
        <Text className="mt-1 font-sans text-body-sm text-error">
          {message.error.message} — tap to retry
        </Text>
      </AnimatedPressable>
    );
  }
  if (message.role === "user") {
    return (
      <>
        <Animated.View entering={entering} exiting={exiting} className="my-1 max-w-[80%] self-end items-end">
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
          {withMenu(
            <View
              className={`px-5 py-3 ${grouped ? "rounded-xl" : "rounded-xl rounded-br-sm"} bg-surface-3`}
            >
              <Text className="font-sans text-body-lg text-primary-text">
                {message.text}
              </Text>
            </View>,
          )}
          <View className="w-full">
            <LinkPreviewCard text={message.text} />
          </View>
          {/* Time + status once per group, like the assistant name row:
              repeating them on every grouped turn is visual noise. */}
          {!grouped && (
            <View className="mt-1 flex-row items-center">
              <Text className="font-sans text-caption text-secondary-text">
                {formatTime(message.at)}
              </Text>
              {/* Three states, one row. The error icon is the row's own
                  record that this question never landed -- the assistant
                  turn below still owns the tap-to-retry card. */}
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
    <Animated.View entering={entering} exiting={exiting} className="my-1 max-w-[75%] flex-row self-start">
      <AssistantAvatar shown={showAvatar} />
      <View className="flex-1">
        {!grouped && (
          <View className="mb-1 flex-row items-center gap-2">
            <Text className="font-sans text-caption text-secondary-text">{APP_NAME}</Text>
            <Text className="font-sans text-caption text-secondary-text">
              {formatTime(message.at)}
            </Text>
          </View>
        )}
        {message.reasoning ? (
          <ReasoningBlock
            text={message.reasoning}
            autoCollapse={settled || message.text.trim() !== ""}
          />
        ) : null}
        {withMenu(
          <View
            className={`border border-border bg-surface-1 px-5 py-3 ${grouped ? "rounded-xl" : "rounded-xl rounded-tl-sm"}`}
          >
            <MarkdownView text={message.text} />
            {settled && <LinkPreviewCard text={message.text} />}
            {message.steps !== undefined && message.steps.length > 0 && (
              // One settled chip style: a step is only ever written after
              // the call finished, so the old "running" variant had no
              // writer. The key is the row id, not the array index.
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                {message.steps.map((step) => {
                  // THREE-WAY DISPATCH, in this order (G5):
                  //   1. a recorded FAILURE -> error block
                  //   2. a registered renderer for this tool name -> its surface
                  //   3. otherwise -> the "used X" chip
                  // An error must NEVER fall through to the chip or a
                  // renderer: that is how a failed tool came to look like
                  // a successful one.
                  //
                  // `ok === false` SPECIFICALLY. Undefined means "never
                  // recorded" -- a row written before the discriminant --
                  // and that is not a failure.
                  if (step.ok === false) {
                    return (
                      <View key={step.id} className="w-full">
                        <ToolErrorBlock tool={step.tool} message={step.result ?? ""} />
                        {/* C15: cost belongs under the RESULT, not in
                            the turn footer — per-tool cost must be
                            attributable. */}
                        <ToolMetricsLine metrics={step.metrics} />
                      </View>
                    );
                  }
                  const Renderer = toolSurfaceFor(step.tool);
                  if (Renderer !== undefined) {
                    // No expanded/onToggle here: a surface owns its own
                    // open/closed state and renders it as a collapsed row
                    // plus a sheet, exactly as pocketpal does. Keeping the
                    // flag in the bubble would make the bubble responsible
                    // for something it cannot see.
                    return (
                    <View key={step.id} className="w-full">
                      <Renderer step={step} />
                    </View>
                  );
                  }
                  const metricsText = formatToolMetrics(step.metrics);
                  return (
                    <View
                      key={step.id}
                      className="flex-row items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5"
                    >
                      <Wrench size={11} color={colors.secondaryText} />
                      <Text className="font-sans text-caption text-secondary-text">
                        {step.tool}
                        {/* PocketPal's chip suffix: same formatter, so
                            the chip and the footer can never disagree. */}
                        {metricsText === null ? "" : ` · ${metricsText}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>,
        )}
        {onRegenerate !== null && settled && (
          <MessageActions
            text={message.text}
            usage={message.usage}
            outcome={message.outcome}
            contextBannerVisible={contextBannerVisible}
            onRegenerate={onRegenerate}
          />
        )}
      </View>
    </Animated.View>
  );
}
