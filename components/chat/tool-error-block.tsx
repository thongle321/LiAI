/** A tool call that failed, stated plainly inside the bubble (audit G5).
 *
 * Before this, every tool call rendered as a chip showing only its name,
 * and the talent seam returned the same bare string for a failure as for a
 * success. So a `web_search` that found nothing and one that errored both
 * appeared as "web_search", and the model answering around a failed
 * lookup was indistinguishable from the model changing its mind.
 *
 * This is the ONLY new surface in the first slice of G5: an error block,
 * everything else still on the chip. Per-tool renderers land next.
 *
 * Glyph plus the word "failed" plus colour, per DESIGN.md's rule that
 * status is never carried by colour alone.
 */

import { Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";

export function ToolErrorBlock({
  tool,
  message,
}: {
  /** The tool's name, so the user knows which capability failed. */
  tool: string;
  /** The talent's reason. Never empty in practice, but not assumed. */
  message: string;
}) {
  return (
    // `basis-full` so it takes its own line: the sibling chips stay in a
    // wrapping row, and an error must not sit squeezed beside them.
    <View
      className="basis-full flex-row items-start gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2"
      // polite, not assertive: the turn still completed, so this informs
      // rather than interrupts -- same reasoning as the chat warning.
      accessibilityLiveRegion="polite"
    >
      <AlertTriangle size={14} color={colors.error} />
      <View className="flex-1">
        <Text className="font-sans-semibold text-caption text-error">
          {tool} failed
        </Text>
        {message !== "" && (
          <Text className="mt-0.5 font-sans text-caption text-secondary-text">
            {message}
          </Text>
        )}
      </View>
    </View>
  );
}