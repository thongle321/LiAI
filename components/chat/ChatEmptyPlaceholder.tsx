/** Empty-chat prompt (DESIGN.md Feedback States, LiAI skin).
 *
 * A soft glyph on Mist, a Title naming the situation, one Body Small Slate
 * line naming the next move, and one primary button. Shown only while no
 * model is active — it unmounts the moment one loads.
 */

import { Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { images } from "../../constants/images.ts";
import { useModelStore } from "../../store/modelStore";

export function ChatEmptyPlaceholder() {
  const router = useRouter();
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);

  if (activeModelId) return null;

  const downloading = models.find((m) => m.downloadStatus === "downloading");
  const ready = models.filter(
    (m) => m.origin !== "remote_api" && m.downloadStatus === "completed",
  );

  let title: string;
  let description: string;
  let buttonText: string | null;
  if (downloading) {
    title = `${downloading.name} is getting ready`;
    description = "We’ll let you know the moment it can chat.";
    buttonText = null;
  } else if (ready.length === 0) {
    title = "No Models Available";
    description = "Download a model to start chatting with LiAI";
    buttonText = "Download Model";
  } else {
    title = "Activate Model To Get Started";
    description = "Pick a model and it activates the moment it finishes downloading.";
    buttonText = "Select Model";
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-24 w-24 items-center justify-center rounded-full bg-surface-2">
        <Image source={images.icon} className="h-16 w-16" />
      </View>
      <View className="mt-6">
        <Text className="text-center font-sans-medium text-h3 text-primary-text">
          {title}
        </Text>
        <Text className="mt-2 text-center font-sans text-body-sm text-secondary-text">
          {description}
        </Text>
      </View>
      {buttonText !== null && (
        <Pressable
          onPress={() => router.push("/models")}
          className="btn btn--primary mt-6 min-w-48"
          accessibilityRole="button"
          accessibilityLabel={buttonText}
        >
          <Text className="text-center font-sans-semibold text-body-md text-on-primary">
            {buttonText}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
