/**
 * Boundary-mock smoke test: prove every native-module alias wired through
 * `jest.config.js` is importable and usable.
 *
 * A mock that throws at import time is invisible until the first component
 * test happens to pull the module in — and then it takes the whole suite down
 * with a module-factory error. Importing each one here turns that into a
 * named failure.
 */

import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { BottomSheet, Host, Picker, Slider, Switch } from "@expo/ui";
import * as Font from "expo-font";
import * as Linking from "expo-linking";
import * as Speech from "expo-speech";
import * as SQLite from "expo-sqlite";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { VoiceOrb, useVoiceAmplitude, useVoiceLevels } from "expo-thinking-orbs";

describe("@expo/ui stub", () => {
  it("renders children through the native control stubs", () => {
    const noop = (): void => {};
    const { getByText } = render(
      <Host>
        <View>
          <Text>inside a Host</Text>
        </View>
        <Switch value onValueChange={noop} />
        <Slider value={0.5} onValueChange={noop} />
        <Picker selectedValue="one" onValueChange={noop}>
          <Picker.Item label="One" value="one" />
        </Picker>
        <BottomSheet isPresented={false} onDismiss={noop}>
          <Text>sheet body</Text>
        </BottomSheet>
      </Host>,
    );
    expect(getByText("inside a Host")).toBeTruthy();
    expect(getByText("sheet body")).toBeTruthy();
  });
});

describe("native SDK boundary mocks", () => {
  it("expo-speech records instead of speaking", async () => {
    expect(Speech.speak("hello")).toBeUndefined();
    expect(Speech.speak).toHaveBeenCalledWith("hello");
    await expect(Speech.stop()).resolves.toBeUndefined();
    expect(await Speech.isSpeakingAsync()).toBe(false);
  });

  it("expo-speech-recognition answers permissions and invokes no listener", () => {
    useSpeechRecognitionEvent("result", () => {
      throw new Error("the mock must never fire an event");
    });
    return expect(ExpoSpeechRecognitionModule.getPermissionsAsync()).resolves.toEqual(
      expect.objectContaining({ canAskAgain: true }),
    );
  });

  it("expo-sqlite fails loudly rather than hanging", async () => {
    await expect(SQLite.openDatabaseAsync("liai-chat.db")).rejects.toThrow(
      /expo-sqlite/,
    );
  });

  it("expo-linking resolves to nothing handled", async () => {
    expect(Linking.createURL("/models")).toBe("liai:///models");
    await expect(Linking.getInitialURL()).resolves.toBe(null);
    await expect(Linking.openURL("https://example.com")).resolves.toBe(false);
  });

  it("expo-font reports every bundled face as loaded", async () => {
    expect(Font.isLoaded("Inter")).toBe(true);
    await expect(Font.loadAsync({ Inter: {} })).resolves.toBeUndefined();
    const [loaded, error] = Font.useFonts({ Inter: {} });
    expect(loaded).toBe(true);
    expect(error).toBe(null);
  });

  it("expo-thinking-orbs renders the orb shell as a labelled View", () => {
    // The hooks exist and hand back level-shaped values, so the voice UI's
    // wiring loads under Jest without the native Skia module.
    function Harness(): React.ReactElement {
      const mic = useVoiceLevels({ sampleRate: 16_000 });
      const agent = useVoiceAmplitude();
      mic.setSamples(new Float32Array(1600), 16_000);
      agent.set(0.5);
      return (
        <VoiceOrb
          state="listening"
          inputAmplitude={mic.level}
          outputAmplitude={agent.level}
          inputLevels={mic}
          size={64}
        />
      );
    }
    const { getByLabelText } = render(
      <View>
        <Harness />
      </View>,
    );
    expect(getByLabelText("Listening")).toBeOnTheScreen();
  });
});
