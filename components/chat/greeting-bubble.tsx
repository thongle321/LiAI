/** Companion greeting: a NON-persisted bubble on an empty chat + the
 *  suggested-prompt chips (PocketPal's GreetingBubble + chip row).
 *
 *  Never a message, never sent to the model — pure scaffolding. The
 *  bubble is list content (renders through MessageList's empty slot);
 *  the chips belong to the composer overlay in the chat screen.
 */

import { Pressable, Text, View } from "react-native";

export function GreetingBubble({
  companionName,
  greeting,
}: {
  companionName: string;
  greeting: string;
}) {
  return (
    <View className="items-start px-4 pb-3">
      <View className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-1 px-4 py-3">
        <Text className="mb-1 text-body-sm font-sans-semibold text-secondary-text">
          {companionName}
        </Text>
        <Text className="text-body-md text-primary-text">{greeting}</Text>
      </View>
    </View>
  );
}

export function SuggestedPromptChips({
  prompts,
  onSend,
}: {
  prompts: string[];
  onSend: (text: string) => void;
}) {
  return (
    <View className="mb-2 flex-row flex-wrap gap-2">
      {prompts.map((prompt) => (
        <Pressable
          key={prompt}
          onPress={() => onSend(prompt)}
          className="min-h-9 rounded-full border border-border bg-surface-1 px-3 justify-center active:bg-surface-3"
          accessibilityRole="button"
          accessibilityLabel={`Send: ${prompt}`}
        >
          <Text className="text-body-sm text-primary-text">{prompt}</Text>
        </Pressable>
      ))}
    </View>
  );
}
