import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useChatHealth } from "../useChatHealth.ts";
import { useChatStore } from "@/store/chat.ts";
import { useModelStore } from "@/store/modelStore.ts";

describe("useChatHealth", () => {
  afterEach(() => {
    act(() => {
      useChatStore.setState({ checkHealth: async () => {} } as never);
      useModelStore.setState({ activeModelId: null } as never);
    });
  });

  it("checks health on mount", async () => {
    const checkHealth = jest.fn().mockResolvedValue(undefined);
    useChatStore.setState({ checkHealth } as never);

    renderHook(() => useChatHealth());

    await waitFor(() => expect(checkHealth).toHaveBeenCalled());
  });

  it("re-checks health when the active model changes", async () => {
    const checkHealth = jest.fn().mockResolvedValue(undefined);
    useChatStore.setState({ checkHealth } as never);
    useModelStore.setState({ activeModelId: "m1" } as never);

    const { rerender } = renderHook(() => useChatHealth());
    const callsBefore = checkHealth.mock.calls.length;

    act(() => {
      useModelStore.setState({ activeModelId: "m2" });
    });

    await waitFor(() =>
      expect(checkHealth.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});