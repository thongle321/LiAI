/** Opening prompt chips under the greeting (empty conversation only).
 *
 * Tapping sends the prompt as a normal turn — no special path, the
 * store treats it like typed text.
 */

import { Pressable, Text, View } from "react-native";

const PROMPTS = [
  "What can you do?",
  "Tell me something interesting",
  "Help me think through a decision",
] as const;

export function SuggestedPrompts({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  return (
    // No horizontal padding: these chips render inside the composer's box
    // (ChatInput's aboveField slot), which owns the px-5 gutter. A second
    // inset here would stack to 40px against the field's 20px.
    <View className="flex-row flex-wrap gap-2 pb-2">
      {PROMPTS.map((prompt) => (
        <Pressable
          key={prompt}
          onPress={() => onPick(prompt)}
          className="min-h-12 justify-center rounded-lg border border-border bg-surface-1 px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel={prompt}
        >
          <Text className="font-sans text-body-sm text-primary-text">
            {prompt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
