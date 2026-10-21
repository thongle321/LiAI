/** The tool-compat notice: once per model, and never for a model that
 *  can call tools.
 *
 *  The decision is pure (services/chat/tool-compat.ts) and the warned-set
 *  is covered in store/models/__tests__/warnings.test.ts. What is left —
 *  and what this covers — is the wiring: the notice reaches the chat
 *  screen's warning surface, and the model is recorded so the notice
 *  never comes back.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useToolCompatWarning } from "../useToolCompatWarning.ts";
import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/model-store.ts";
import { TOOL_COMPAT_WARNING } from "@/services/chat/tool-compat.ts";
import type { Companion } from "@/types/companion.ts";
import type { ModelSpec } from "@/types/models.ts";

function companion(talents: string[]): Companion {
  return {
    type: "local",
    id: "pal-1",
    name: "Ada",
    systemPrompt: "",
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: "local",
    pact: { talents: talents.map((name) => ({ name, necessity: "optional" })) },
  };
}

function spec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "model-1",
    name: "Tiny",
    author: "someone",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [{ name: "tiny.gguf", size: 1, downloadUrl: "https://example.com" }],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 1,
    totalBytes: 1,
    ...overrides,
  };
}

function setModelState(overrides: {
  activeModelId?: string | null;
  activeProviderType?: "local" | "remote" | null;
  models?: ModelSpec[];
}) {
  useModelStore.setState({
    activeModelId:
      "activeModelId" in overrides ? overrides.activeModelId : "model-1",
    activeProviderType:
      overrides.activeProviderType === undefined
        ? "local"
        : overrides.activeProviderType,
    models: overrides.models ?? [spec({ supportsTools: false })],
    toolCompatWarnedModels: [],
    // The real writer reaches AsyncStorage through a DYNAMIC import, which
    // jest's CommonJS runtime cannot resolve — so the write would fail
    // (harmlessly, but noisily) in every test. The persistence itself is
    // covered in store/models/__tests__/warnings.test.ts, which injects a
    // storage; here only the in-memory set matters.
    saveToolCompatWarned: async () => {},
  } as never);
}

describe("useToolCompatWarning", () => {
  afterEach(() => {
    act(() => {
      useModelStore.setState({
        activeModelId: null,
        activeProviderType: null,
        models: [],
        toolCompatWarnedModels: [],
      } as never);
      useChatStore.setState({ chatWarning: null } as never);
    });
  });

  it("warns when a companion's talents meet a model with no tool support", async () => {
    setModelState({});
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning?.message).toBe(
        TOOL_COMPAT_WARNING,
      ),
    );
    expect(useChatStore.getState().chatWarning?.severity).toBe("warning");
  });

  it("offers no retry: the notice is not a failed turn", async () => {
    setModelState({});
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning).not.toBeNull(),
    );
    expect(useChatStore.getState().chatWarning?.recoverable).toBe(false);
  });

  it("records the model so the notice never comes back", async () => {
    setModelState({});
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([
        "model-1",
      ]),
    );
  });

  it("stays quiet for a model that supports tools", async () => {
    setModelState({ models: [spec({ supportsTools: true })] });
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([]),
    );
    expect(useChatStore.getState().chatWarning).toBeNull();
  });

  it("stays quiet for a model that was never probed", async () => {
    setModelState({ models: [spec({})] });
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([]),
    );
    expect(useChatStore.getState().chatWarning).toBeNull();
  });

  it("stays quiet for a companion that declares no talents", async () => {
    setModelState({});
    renderHook(() => useToolCompatWarning(companion([])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([]),
    );
    expect(useChatStore.getState().chatWarning).toBeNull();
  });

  it("stays quiet for a remote provider", async () => {
    setModelState({ activeProviderType: "remote" });
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([]),
    );
    expect(useChatStore.getState().chatWarning).toBeNull();
  });

  it("stays quiet when no model is active", async () => {
    setModelState({ activeModelId: null });
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useModelStore.getState().toolCompatWarnedModels).toEqual([]),
    );
    expect(useChatStore.getState().chatWarning).toBeNull();
  });

  it("stays quiet for a model already in the warned-set", async () => {
    setModelState({});
    useModelStore.setState({ toolCompatWarnedModels: ["model-1"] } as never);
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning).toBeNull(),
    );
  });

  it("keeps the notice up after recording the model", async () => {
    // The notice is raised and the model is recorded in the same pass. The
    // next run must not read "already warned" and take the notice down —
    // it would flash for a frame and be gone.
    setModelState({});
    const { rerender } = renderHook(
      ({ pal }: { pal: Companion }) => useToolCompatWarning(pal),
      { initialProps: { pal: companion(["web_search"]) } },
    );

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning).not.toBeNull(),
    );
    const raised = useChatStore.getState().chatWarning;

    // A new companion object re-runs the effect with the same facts.
    rerender({ pal: companion(["web_search"]) });

    expect(useChatStore.getState().chatWarning).toBe(raised);
  });

  it("takes the notice down when the model changes under it", async () => {
    setModelState({});
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning).not.toBeNull(),
    );

    // A model that supports tools: the notice was about the old one.
    act(() => {
      useModelStore.setState({
        activeModelId: "model-2",
        models: [spec({ id: "model-2", supportsTools: true })],
      } as never);
    });

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning).toBeNull(),
    );
  });

  it("leaves another notice's warning alone", async () => {
    // The chat's warning slot is shared. A notice this hook did not raise
    // is not ours to take down.
    setModelState({});
    useChatStore.setState({
      chatWarning: {
        message: "the context is full",
        severity: "warning",
        recoverable: false,
      },
    } as never);
    renderHook(() => useToolCompatWarning(companion(["web_search"])));

    await waitFor(() =>
      expect(useChatStore.getState().chatWarning?.message).toBe(
        TOOL_COMPAT_WARNING,
      ),
    );
  });
});
