/** Assistant avatar, shown once per message group.
 *
 * Portrait, not a glyph: LiAI's identity is a character, so a robot icon
 * would replace the brand with a category. Non-closing rows render a
 * spacer of the same width so the bubble edge never moves.
 */

import { Image as RNImage, View } from "react-native";

import { APP_NAME } from "../../constants/app.ts";
import { images } from "../../constants/images.ts";

export function AssistantAvatar({ shown }: { shown: boolean }) {
  if (!shown) return <View className="mr-2 w-8" />;
  return (
    <RNImage
      source={images.icon}
      className="mr-2 mt-1 h-8 w-8 rounded-full"
      accessibilityLabel={`${APP_NAME} avatar`}
    />
  );
}
