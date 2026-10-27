/** The voice tab screen: its rendering contract over the session
 *  circuit. The controller itself is covered by
 *  hooks/__tests__/useVoiceMode.test.tsx; this suite mocks the session
 *  consumer (useVoiceSession) and pins what the SCREEN does with its
 *  surface — labels per phase, the mic press split (closed → enter the
 *  gates, open → the cloud tap), the issue line's Settings affordance,
 *  End, and the controller's sheets.
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
/** Focus, read at render time; the vision swap resets on blur. Pinned so
 *  the bare render (no router) doesn't die on useIsFocused. */
let focusNow = true;

jest.mock("expo-router", () => ({
  ...jest.requireActual("expo-router"),
  useIsFocused: () => focusNow,
}));

import type { ModelSpec } from "@/types/models.ts";

/** A minimal completed local model (the fixture the engine gates on). */
function completedModel(
  over: Partial<ModelSpec> = {},
): ModelSpec {
  return {
    id: "m1",
    name: "Gemma 3 1B",
    author: "ggml-org",
    description: "Test fixture",
    origin: "huggingface",
    type: "llm",
    files: [
      {
        name: "gemma.gguf",
        size: 999,
        downloadUrl: "https://example.com/gemma.gguf",
      },
    ],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 999,
    totalBytes: 999,
    ...over,
  };
}

function mmprojFile(): ModelSpec["projector"] {
  return {
    name: "mmproj.gguf",
    size: 999,
    downloadUrl: "https://example.com/mmproj.gguf",
  };
}

function armModels(models: ModelSpec[]): void {
  useModelStore.setState({
    models,
    activeModelId: "m1",
    activeProviderType: "local",
  });
}

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
  toggleMute: jest.fn(() => {}),
  collapse: jest.fn(() => {}),
  expand: jest.fn(() => {}),
  end: jest.fn(async () => {}),
};

function surface(
  over: Partial<ReturnType<typeof useVoiceMode>> = {},
): ReturnType<typeof useVoiceMode> {
  return {
    phase: "closed",
    micMuted: false,
    presentation: "full",
    origin: "voice",
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
const mockMicSink = jest.fn((_sink?: unknown) => () => {});

jest.mock("@/hooks/useVoiceMode.ts", () => ({
  // The screen is a CONSUMER (issue 01): the session is read through
  // useVoiceSession; the controller lives at the tab layout, so the
  // screen never passes deps or calls the host hook.
  useVoiceSession: () => mockSurface,
  setVoiceMicSink: (...args: unknown[]) => mockMicSink(...(args as [unknown])),
}));

function armStores(): void {
  useVoice.setState({ playbackState: { mode: "idle" } });
  useModelStore.setState({ models: [], activeModelId: null, remoteApis: [] });
}

beforeEach(() => {
  armStores();
  jest.clearAllMocks();
  mockMicSink.mockClear();
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
    // This screen registers its level capsule as the session's mic feed
    // (the controller lives at the tab layout; the sink rides here).
    expect(mockMicSink).toHaveBeenCalledWith(expect.any(Function));
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

  it("the collapsed presentation rides the bar instead of the full view", () => {
    mockSurface = surface({
      phase: "listening",
      presentation: "bar",
      micMuted: true,
    });
    renderScreen();

    // The full view is gone; the bar shows the same session state.
    expect(screen.queryByText("LISTENING")).not.toBeOnTheScreen();
    expect(screen.getByTestId("voice-bar")).toBeOnTheScreen();
    expect(screen.getByText("MICROPHONE OFF")).toBeOnTheScreen();
    // Same contract, new place: mute and End still hand off.
    fireEvent.press(screen.getByTestId("voice-mute"));
    expect(actions.toggleMute).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("voice-bar-end"));
    expect(actions.end).toHaveBeenCalledTimes(1);
    // The Eye rides along in the collapsed presentation too.
    expect(screen.getByLabelText("Open vision")).toBeOnTheScreen();
  });
});

describe("VoiceScreen vision swap", () => {
  it("the Eye button is always here; entering with a live session ends it", () => {
    mockSurface = surface({ phase: "listening", heard: "what do you see" });
    renderScreen();

    expect(screen.getByLabelText("Open vision")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Open vision"));
    // Cleanup before the camera: the session stop happens on entry.
    expect(actions.end).toHaveBeenCalledTimes(1);
    // The orb UI gave way to the camera HUD; nothing of voice remains.
    expect(screen.queryByText("LISTENING")).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Stop vision")).toBeOnTheScreen();
  });

  it("entering from closed ends nothing; Stop vision returns to the orb", () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText("Open vision"));
    expect(actions.end).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Stop vision")).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText("Stop vision"));
    expect(screen.getByText("WAITING")).toBeOnTheScreen();
  });

  it("a text-only model says so up front and keeps the mic dead", () => {
    armModels([completedModel()]); // no projector, no vision switch
    renderScreen();

    fireEvent.press(screen.getByLabelText("Open vision"));

    expect(screen.getByText("This model can't see images.")).toBeOnTheScreen();
    expect(
      screen.queryByText("Vision is off for this model."),
    ).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Talk").props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it("a toggled-off model keeps its fixable card; Open Models is the action", () => {
    armModels([
      completedModel({ projector: mmprojFile(), visionEnabled: false }),
    ]);
    renderScreen();

    fireEvent.press(screen.getByLabelText("Open vision"));

    expect(screen.getByText("Vision is off for this model.")).toBeOnTheScreen();
    expect(
      screen.queryByText("This model can't see images."),
    ).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Open Models")).toBeOnTheScreen();
    // Fixable, but the mic is still dead until the flag is back on: the
    // blind model cannot answer "what do you see?".
    expect(screen.getByLabelText("Talk").props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it("a vision-capable model shows neither card, and the mic is live", () => {
    armModels([
      completedModel({ projector: mmprojFile(), visionEnabled: true }),
    ]);
    renderScreen();

    fireEvent.press(screen.getByLabelText("Open vision"));

    expect(
      screen.queryByText("Vision is off for this model."),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByText("This model can't see images."),
    ).not.toBeOnTheScreen();
    expect(screen.getByText("Tap the mic and ask about what you see")).toBeOnTheScreen();
    expect(screen.getByLabelText("Talk").props.accessibilityState.disabled).toBe(
      false,
    );
  });
});



