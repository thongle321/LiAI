import "../global.css";
import { Stack } from "expo-router";
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  useFonts,
} from "@expo-google-fonts/raleway";
import { Uniwind } from "uniwind";

// Dark-only app (design_system.png): lock theme so device light mode
// can't wash out the dystopian palette.
Uniwind.setTheme("dark");

export default function RootLayout() {
  const [loaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
  });

  // ponytail: no expo-splash-screen dep — gate render so nothing paints
  // in the system font. Add it when the blank-dark flash bothers.
  if (!loaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0B0C0C" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="chat" />
    </Stack>
  );
}
