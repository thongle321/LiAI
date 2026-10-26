/** The composer's plus gate must never be a silent dead button.
 *
 *  PocketPal's isPlusButtonEnabled shape renders the attach button always
 *  and disables it with a hint when the active model cannot see. The port
 *  matched the disabled render but answered NO feedback: a press did
 *  nothing, silently. The contract under test (mirrors the G9 send gate):
 *  the button KEEPS its disabled look but stays pressable, and a gated
 *  press answers with a temporary helper line naming THE reason —
 *  no model loaded, vision switched off, or no vision projector paired.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MessageInput } from "../message-input.tsx";
import { makeSpec } from "@/jest/fixtures/models.ts";
import { SnackbarProvider } from "@/components/snackbar.tsx";
import { useModelStore } from "@/store/model-store.ts";

jest.mock("@/services/chat/attachments.ts", () => ({
  pickImages: jest.fn(async () => []),
}));

jest.mock("@/services/inference/offload.ts", () => ({
  suspendBackgroundRelease: () => () => undefined,
}));

jest.mock("@/hooks/useVoiceCapture.ts", () => ({
  useVoiceCapture: () => ({
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
    captureState: "idle",
  }),
}));

function renderComposer() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <SnackbarProvider>
        <MessageInput
          sending={false}
          ready={true}
          onSend={async () => true}
          companionName={null}
          onOpenPicker={() => undefined}
        />
      </SnackbarProvider>
    </SafeAreaProvider>,
  );
}

function armModels(over: Parameters<typeof makeSpec>[0] = {}) {
  act(() => {
    useModelStore.setState({
      models: [
        makeSpec({
          id: "m1",
          name: "Test model",
          origin: "huggingface",
          type: "llm",
          files: [
            {
              name: "model.gguf",
              size: 10,
              downloadUrl: "https://example.test/model.gguf",
            },
          ],
          downloadStatus: "completed",
          ...over,
        }),
      ],
      activeModelId: "m1",
      activeProviderType: "local",
      remoteApis: [],
    });
  });
}

describe("MessageInput plus gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("answers a press with no model loaded", () => {
    armModels({ downloadStatus: "idle" });
    useModelStore.setState({ activeModelId: null, activeProviderType: null });
    renderComposer();
    fireEvent.press(screen.getByLabelText("Load a model to attach a photo"));
    expect(screen.getByText("Load a model to attach a photo.")).toBeTruthy();
  });

  it("answers a press when vision is switched off", () => {
    armModels({
      projector: {
        name: "mmproj.gguf",
        size: 5,
        downloadUrl: "https://example.test/mmproj.gguf",
      },
      visionEnabled: false,
    });
    renderComposer();
    fireEvent.press(screen.getByLabelText("This model can't see images"));
    expect(
      screen.getByText("Vision is switched off for this model — turn it on in Models."),
    ).toBeTruthy();
  });

  it("answers a press when no vision projector is paired", () => {
    armModels();
    renderComposer();
    fireEvent.press(screen.getByLabelText("This model can't see images"));
    expect(
      screen.getByText("No vision projector is paired with this model — pair it in Models."),
    ).toBeTruthy();
  });

  it("answers a press when the remote provider's probe recorded no vision", () => {
    act(() => {
      useModelStore.setState({
        models: [],
        remoteApis: [
          {
            id: "hf1",
            name: "My API",
            providerType: "custom_openai",
            baseUrl: "https://api.example.test",
            apiKey: "k",
            modelName: "m",
            isActive: true,
          },
        ],
        activeModelId: "remote-hf1",
        activeProviderType: "remote",
        remoteCaps: { hf1: { reachable: true, checkedAt: 0, supportsVision: false } },
      });
    });
    renderComposer();
    fireEvent.press(screen.getByLabelText("This model can't see images"));
    expect(screen.getByText("This model can't see images.")).toBeTruthy();
  });

  it("still opens the attach menu when the model can see", () => {
    armModels({
      projector: {
        name: "mmproj.gguf",
        size: 5,
        downloadUrl: "https://example.test/mmproj.gguf",
      },
      visionEnabled: true,
    });
    renderComposer();
    fireEvent.press(screen.getByLabelText("Attach a photo"));
    expect(screen.getByText("Take photo")).toBeTruthy();
    expect(screen.getByText("Choose from gallery")).toBeTruthy();
  });
});
