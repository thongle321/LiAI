/** Empty-chat prompt (PocketPal ChatEmptyPlaceholder parity, LiAI skin).
 *
 * Centered logo + title + description + one wide button, shown only while
 * no model is active — it unmounts itself the moment one loads. Three
 * states, same as PocketPal: downloading ("getting ready", no button),
 * nothing downloaded yet (go download), downloads exist but none active.
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
    description =
      "Download a model to get started. It activates automatically once ready.";
    buttonText = "Select Model";
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Image
        source={images.icon}
        className="h-28 w-28"
        style={{ borderRadius: 30 }}
      />
      <View className="mt-4">
        <Text className="text-center font-sans-semibold text-h4 text-primary-text">
          {title}
        </Text>
        <Text className="mt-2 text-center font-sans text-body-md text-secondary-text">
          {description}
        </Text>
      </View>
      {buttonText !== null && (
        <Pressable
          onPress={() => router.push("/models")}
          className="btn btn--primary mt-4 min-w-50"
        >
          <Text className="text-center font-sans-semibold text-on-primary">
            {buttonText}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
