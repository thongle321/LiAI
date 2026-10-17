/** Unmatched route fallback (expo-router's +not-found convention).
 *
 * A bad deep link (`liai://typo`) used to fall through to expo-router's
 * built-in "Unmatched" view. This keeps the failure inside LiAI's tokens
 * and offers a way home. */
import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function NotFound() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-base px-6">
      <Text className="font-sans-semibold text-h3 text-primary-text">
        Page not found
      </Text>
      <Text className="text-center font-sans text-body-md text-secondary-text">
        This link doesn't point anywhere in LiAI.
      </Text>
      <Link href="/" className="btn btn--primary">
        <Text className="font-sans-semibold text-body-md text-on-primary">
          Go home
        </Text>
      </Link>
    </View>
  );
}