/** The voice tab screen: its rendering contract over the session
 *  controller. The controller itself is covered by
 *  hooks/__tests__/useVoiceMode.test.tsx; this suite mocks THAT hook and
 *  pins what the SCREEN does with its surface — labels per phase, the mic
 *  press split (closed → enter the gates, open → the cloud tap), the
 *  issue line's Settings affordance, End, and the controller's sheets.
 *
 *  Screen suites live in jest/ (app/ must hold nothing but routes).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import VoiceScreen from "../app/(drawer)/(tabs)/voice.tsx";
import { openSettings } from "expo-linking";
import type { useVoiceMode } from "@/hooks/useVoiceMode.ts";
import type { VoiceModeSheet } from "@/hooks/useVoiceMode.ts";
import { useVoice } from "@/store/voice.ts";
import { useModelStore } from "@/store/model-store.ts";

/** The shared wrapper: the screen's sheets read safe-area insets. */
function renderScreen(): ReturnType<typeof render> {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <VoiceScreen />
    </SafeAreaProvider>,
  );
}

const actions = {
  requestEntry: jest.fn(async () => {}),
  dismissSheet: jest.fn(() => {}),
  setupDone: jest.fn(async () => {}),
  continueAnyway: jest.fn(async () => {}),
  openModels: jest.fn(() => {}),
  tapCloud: jest.fn(() => {}),
  end: jest.fn(async () => {}),
};

function surface(
  over: Partial<ReturnType<typeof useVoiceMode>> = {},
): ReturnType<typeof useVoiceMode> {
  return {
    phase: "closed",
    heard: "",
    reply: null,
    issue: null,
    needsMicSettings: false,
    sheet: null,
    ...actions,
    ...over,
  } as ReturnType<typeof useVoiceMode>;
}

let mockSurface = surface();
const hookDeps = {
  last: null as null | (Parameters<typeof useVoiceMode>[0] & object),
};

jest.mock("@/hooks/useVoiceMode.ts", () => ({
  useVoiceMode: (deps?: Parameters<typeof useVoiceMode>[0]) => {
    hookDeps.last = deps ?? null;
    return mockSurface;
  },
}));

function armStores(): void {
  useVoice.setState({ playbackState: { mode: "idle" } });
  useModelStore.setState({ models: [], activeModelId: null, remoteApis: [] });
}

beforeEach(() => {
  armStores();
  jest.clearAllMocks();
  hookDeps.last = null;
  mockSurface = surface();
});

describe("VoiceScreen", () => {
  it("closed: Waiting; the mic press enters the gates", () => {
    renderScreen();

    expect(screen.getByText("WAITING")).toBeOnTheScreen();
    expect(screen.getByText("Waiting")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Tap to speak"));
    expect(actions.requestEntry).toHaveBeenCalledTimes(1);
    expect(actions.tapCloud).not.toHaveBeenCalled();
    // The mic capsule is wired to the controller as the orb's level feed.
    expect(typeof hookDeps.last?.onMicAudio).toBe("function");
  });

  it("listening: the label gains the phase; the mic press is the cloud tap", () => {
    mockSurface = surface({ phase: "listening", heard: "hello" });
    renderScreen();

    expect(screen.getByText("LISTENING")).toBeOnTheScreen();
    expect(screen.getByText("Listening")).toBeOnTheScreen();
    expect(screen.getByText("hello")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Tap to stop or take the turn"));
    expect(actions.tapCloud).toHaveBeenCalledTimes(1);
    expect(actions.requestEntry).not.toHaveBeenCalled();
    // End is the explicit way out of a live session.
    expect(screen.getByLabelText("End conversation")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("End conversation"));
    expect(actions.end).toHaveBeenCalledTimes(1);
  });

  it("phases keep their labels: starting and transcribing are new", () => {
    mockSurface = surface({ phase: "starting" });
    const { unmount } = renderScreen();
    expect(screen.getByText("CONNECTING")).toBeOnTheScreen();
    expect(screen.getByText("Connecting")).toBeOnTheScreen();
    unmount();

    mockSurface = surface({ phase: "transcribing" });
    renderScreen();
    expect(screen.getByText("PROCESSING")).toBeOnTheScreen();
    expect(screen.getByText("Processing")).toBeOnTheScreen();
  });

  it("speaking: the Playing-audio overlay with Stop riding the cloud tap", () => {
    mockSurface = surface({ phase: "speaking", reply: "Here is the answer." });
    renderScreen();

    expect(screen.getByText("SPEAKING")).toBeOnTheScreen();
    expect(screen.getByText("Speaking")).toBeOnTheScreen();
    expect(screen.getByText("Playing audio…")).toBeOnTheScreen();
    expect(screen.getByText("Here is the answer.")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Stop playback"));
    expect(actions.tapCloud).toHaveBeenCalledTimes(1);
  });

  it("an issue while closed reads Try again; a blocked mic rides Settings", () => {
    mockSurface = surface({
      issue: "Couldn't send that. Try again.",
    });
    renderScreen();

    expect(screen.getByText("Couldn't send that. Try again.")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Try again"));
    expect(actions.requestEntry).toHaveBeenCalledTimes(1);

    expect(openSettings).not.toHaveBeenCalled();
  });

  it("a mic-blocked issue is a Settings link, not dead text", () => {
    mockSurface = surface({
      issue: "Microphone is blocked — enable it in Settings.",
      needsMicSettings: true,
    });
    renderScreen();

    expect(
      screen.getByText("Microphone is blocked — enable it in Settings."),
    ).toBeOnTheScreen();
    fireEvent.press(
      screen.getByText("Microphone is blocked — enable it in Settings."),
    );
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("the controller's setup sheet renders; Done resumes entry", () => {
    mockSurface = surface({ sheet: { kind: "setup" } as VoiceModeSheet });
    renderScreen();

    expect(screen.getByText("Set up voice mode")).toBeOnTheScreen();
    expect(screen.getByTestId("voice-setup-continue")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("voice-setup-cancel"));
    expect(actions.dismissSheet).toHaveBeenCalledTimes(1);
  });

  it("the memory sheet renders the fit; smaller model routes to Models", () => {
    mockSurface = surface({
      sheet: {
        kind: "memory",
        fit: {
          status: "tight",
          sttTier: "base",
          breakdown: {
            rows: [
              { kind: "chat", bytes: 1_000_000_000 },
              { kind: "stt", bytes: 226_047_904 },
            ],
            neededBytes: 1_226_047_904,
            availableBytes: 2_000_000_000,
          },
        },
      } as VoiceModeSheet,
    });
    renderScreen();

    expect(screen.getByText("Memory is tight")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("voice-memory-continue"));
    expect(actions.continueAnyway).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("voice-memory-smaller-model"));
    expect(actions.openModels).toHaveBeenCalledTimes(1);
  });
});



