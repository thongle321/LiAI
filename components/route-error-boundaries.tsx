/** Route error boundaries, exported as `ErrorBoundary` from the layouts.
 *
 * These used to live at `app/+error.tsx`, `app/(drawer)/+error.tsx` and
 * `app/(drawer)/(tabs)/+error.tsx`. That is TANSTACK ROUTER's convention.
 * expo-router signals a boundary by exporting a named `ErrorBoundary` from
 * a `_layout.tsx`, and its route scanner rejects any route node whose
 * filename starts with '+' -- so those three files made the app throw
 * during route-tree construction and never rendered at all.
 *
 * They live here instead because everything under `app/` is treated as a
 * route. The behaviour is unchanged; only the wiring is corrected.
 */

import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

type BoundaryProps = { error: Error & { digest?: string }; reset: () => void };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-base px-8">
      {children}
    </View>
  );
}

function Detail({ error }: { error: Error }) {
  return (
    <Text className="font-sans text-body-md text-secondary-text">{error.message}</Text>
  );
}

function Retry({
  label,
  reset,
}: {
  label: string;
  reset: () => void;
}) {
  return (
    <Pressable
      onPress={reset}
      className="btn btn--primary active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text className="text-action">{label}</Text>
    </Pressable>
  );
}

/** The whole app failed. Offers a way out, not just a retry. */
export function RootErrorBoundary({ error, reset }: BoundaryProps) {
  const router = useRouter();
  return (
    <Shell>
      <Text className="font-sans-semibold text-body-lg text-primary-text">
        Something went wrong
      </Text>
      <Detail error={error} />
      <View className="flex-row gap-2">
        <Retry label="Try again" reset={reset} />
        <Pressable
          onPress={() => router.replace("/(drawer)/(tabs)/chat")}
          className="btn btn--secondary active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
        >
          <Text className="text-body">Back to chat</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

/** The drawer navigator failed. */
export function DrawerErrorBoundary({ error, reset }: BoundaryProps) {
  return (
    <Shell>
      <Text className="font-sans-semibold text-body-lg text-primary-text">
        Menu failed to render
      </Text>
      <Detail error={error} />
      <Retry label="Reload menu" reset={reset} />
    </Shell>
  );
}

/** The chat tabs failed -- a conversation, in practice. */
export function TabsErrorBoundary({ error, reset }: BoundaryProps) {
  return (
    <Shell>
      <Text className="font-sans-semibold text-body-lg text-primary-text">
        This conversation failed to render
      </Text>
      <Detail error={error} />
      <Retry label="Reload conversation" reset={reset} />
    </Shell>
  );
}
