import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useChatSessionLoader } from "../useChatSessionLoader.ts";
import { useChatStore } from "@/store/chat.ts";

describe("useChatSessionLoader", () => {
  afterEach(() => {
    act(() => {
      useChatStore.setState({
        loadSession: async () => {},
        checkHealth: async () => {},
      } as never);
    });
  });

  it("loads the session then checks health on mount", async () => {
    const loadSession = jest.fn().mockResolvedValue(undefined);
    const checkHealth = jest.fn().mockResolvedValue(undefined);
    useChatStore.setState({ loadSession, checkHealth } as never);

    renderHook(() => useChatSessionLoader());

    await waitFor(() => expect(loadSession).toHaveBeenCalled());
    await waitFor(() => expect(checkHealth).toHaveBeenCalled());
    // health runs after load resolves
    expect(loadSession.mock.invocationCallOrder[0]).toBeLessThan(
      checkHealth.mock.invocationCallOrder[0],
    );
  });
});