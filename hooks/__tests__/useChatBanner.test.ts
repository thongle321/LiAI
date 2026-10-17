/** The banner slot's view-model, tested apart from the screen.
 *
 * The resolver itself is covered as a pure function
 * (services/chat/__tests__/banner-variant.test.ts). What this file holds is
 * the wiring the hook owns: which turn the banner speaks for, how the window
 * is resolved for a remote model, and the per-session dismissal that has to
 * survive exactly one turn.
 */

import { act, renderHook } from "@testing-library/react-native";

import { useChatBanner, type ChatBannerInput } from "../useChatBanner.ts";
import type { ChatMessage } from "@/types/chat.ts";
import { AUTOCLEAR_RUNWAY } from "@/services/chat/banner-variant.ts";

const NCtx = 4096;

function assistant(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `a-${over.id ?? "1"}`,
    role: "assistant",
    text: "ok",
    at: 0,
    ...over,
  };
}

function htmlStep(id: string): NonNullable<ChatMessage["steps"]>[number] {
  return { id, tool: "render_html", ok: true, position: 0 };
}

function fullTurn(promptTokens: number): ChatMessage {
  return assistant({
    outcome: { contextFull: true },
    usage: { promptTokens, completionTokens: 8, totalTokens: promptTokens + 8 },
  });
}

function setup(over: Partial<ChatBannerInput> = {}) {
  const input: ChatBannerInput = {
    messages: [],
    nCtx: NCtx,
    activeModelId: "local-model",
    activeProviderType: "local",
    remoteCaps: {},
    ...over,
  };
  return renderHook((props: ChatBannerInput) => useChatBanner(props), {
    initialProps: input,
  });
}

describe("useChatBanner", () => {
  it("shows nothing for a thread that has never filled", () => {
    const { result } = setup({ messages: [assistant()] });

    expect(result.current.banner.variant).toBe("none");
    expect(result.current.bannerShowing).toBe(false);
    expect(result.current.contextFullShowing).toBe(false);
    expect(result.current.fill).toBe(0);
  });

  it("speaks for the newest assistant turn, not the oldest", () => {
    const { result } = setup({
      messages: [fullTurn(NCtx - 1), assistant({ id: "2", text: "fine" })],
    });

    expect(result.current.banner.variant).toBe("none");
  });

  it("reports context-full and the fill against the local window", () => {
    const { result } = setup({ messages: [fullTurn(NCtx - AUTOCLEAR_RUNWAY)] });

    expect(result.current.banner.variant).toBe("context-full");
    expect(result.current.contextFullShowing).toBe(true);
    expect(result.current.bannerShowing).toBe(true);
    // 3840/4096 rounds to 94: inside the runway, but not pinned at the top.
    expect(result.current.fill).toBe(94);
  });

  it("lets the banner clear itself when a later turn recovers", () => {
    const { result } = setup({
      messages: [fullTurn(NCtx), assistant({ id: "2", usage: undefined })],
    });

    expect(result.current.banner.variant).toBe("none");
  });

  it("counts HTML previews with no model loaded at all", () => {
    const { result } = setup({
      messages: [
        assistant({ steps: [htmlStep("s1"), htmlStep("s2"), htmlStep("s3")] }),
        assistant({ id: "2", steps: [htmlStep("s4")] }),
      ],
      activeModelId: null,
      activeProviderType: null,
    });

    expect(result.current.banner.variant).toBe("html-soft-cap");
  });

  it("divides a remote thread by its probed window, not the local one", () => {
    const { result } = setup({
      messages: [assistant({ usage: { promptTokens: 850, completionTokens: 8, totalTokens: 858 } })],
      activeModelId: "remote-acme",
      activeProviderType: "remote",
      remoteCaps: { acme: { model: "x", contextLength: 1000, reachable: true, checkedAt: 0 } },
    });

    // 850/1000 crosses the warning threshold; against nCtx (4096) it is quiet.
    expect(result.current.banner.variant).toBe("context-warning");
    expect(result.current.fill).toBe(85);
  });

  it("keeps an unprobed remote window unknown rather than borrowing nCtx", () => {
    const { result } = setup({
      messages: [fullTurn(NCtx - AUTOCLEAR_RUNWAY)],
      activeModelId: "remote-acme",
      activeProviderType: "remote",
      remoteCaps: {},
    });

    // A full turn on a remote model cannot fill a window nobody reported.
    expect(result.current.banner.variant).toBe("none");
  });

  it("escalates the wording after two context-full turns in a row", () => {
    const { result } = setup({ messages: [fullTurn(NCtx), fullTurn(NCtx)] });

    expect(result.current.banner.copy).toBe("escalated");
  });

  it("dismisses for one turn, then speaks again", () => {
    const { result, rerender } = setup({ messages: [fullTurn(NCtx)] });
    expect(result.current.bannerShowing).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.bannerShowing).toBe(false);

    // Same banner, new turn: the dismissal is per session, not per thread.
    rerender({
      messages: [fullTurn(NCtx), assistant({ id: "2", text: "still full" })],
      nCtx: NCtx,
      activeModelId: "local-model",
      activeProviderType: "local",
      remoteCaps: {},
    });
    expect(result.current.bannerShowing).toBe(false);

    rerender({
      messages: [fullTurn(NCtx), assistant({ id: "2" }), fullTurn(NCtx)],
      nCtx: NCtx,
      activeModelId: "local-model",
      activeProviderType: "local",
      remoteCaps: {},
    });
    expect(result.current.bannerShowing).toBe(true);
  });
});