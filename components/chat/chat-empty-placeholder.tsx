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

export function ChatEmptyPlaceholder({
  onSelectModel,
}: {
  /** Opens the in-chat model picker (PocketPal's ChatPalModelPickerSheet).
   *  Absent falls back to the /models route. */
  onSelectModel?: () => void;
}) {
  const router = useRouter();
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  // Remote APIs count as "available": with one configured and nothing
  // downloaded, the picker has something to offer, and sending the user to
  // /models to download a local model would hide the model they already
  // have. PocketPal's hasAvailableModels counts both halves the same way.
  const remoteApis = useModelStore((s) => s.remoteApis);

  if (activeModelId) return null;

  const downloading = models.find((m) => m.downloadStatus === "downloading");
  const ready = models.filter(
    (m) => m.origin !== "remote_api" && m.downloadStatus === "completed",
  );

  let title: string;
  let description: string;
  let buttonText: string | null;
  // What the button DOES, separate from what it SAYS: dispatching on the
  // display string couples behaviour to copy (a rewording silently
  // re-routes the button), and a "download" | "pick" field is read once.
  let cta: "download" | "pick";
  if (downloading) {
    title = `${downloading.name} is getting ready`;
    description = "We’ll let you know the moment it can chat.";
    buttonText = null;
    cta = "download";
  } else if (ready.length === 0 && remoteApis.length === 0) {
    title = "No Models Available";
    description = "Download a model to start chatting with LiAI";
    buttonText = "Download Model";
    cta = "download";
  } else {
    title = "Activate Model To Get Started";
    // No auto-activation since download completion stopped selecting a model
    // (PocketPal parity), so the copy must not promise it.
    description = "Pick a downloaded model and tap Load to start chatting.";
    buttonText = "Select Model";
    cta = "pick";
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-24 w-24 items-center justify-center rounded-full bg-surface-2">
        {/* The adaptive-icon FOREGROUND (arrow on transparent), not images.icon:
            the full icon carries its own light-blue SQUARE background, and a
            square inside the 999px Mist plate is a shape collision. The
            foreground is the glyph alone — "a soft glyph at 999px in Mist"
            exactly. 80 keeps the arrow optically centred with the plate's
            own margin around it. */}
        <Image source={images.glyph} className="h-20 w-20" />
      </View>
      <View className="mt-6">
        <Text className="text-center font-sans-medium text-body-lg text-primary-text">
          {title}
        </Text>
        <Text className="mt-2 text-center text-quiet">
          {description}
        </Text>
      </View>
      {buttonText !== null && (
        <Pressable
          onPress={() =>
            cta === "download" || onSelectModel === undefined
              ? router.navigate("/models")
              : onSelectModel()
          }
          className="btn btn--primary active:opacity-80 mt-6 min-w-48"
          accessibilityRole="button"
          accessibilityLabel={buttonText}
        >
          <Text className="text-center text-action">
            {buttonText}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
