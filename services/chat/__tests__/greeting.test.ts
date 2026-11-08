/** What an empty thread shows for the bound companion (PocketPal's
 *  ChatView greeting predicates).
 *
 *  The bubble and the chips are INDEPENDENT in the reference: the bubble
 *  needs `greeting.text`, the chips need `greeting.suggestedPrompts`. LiAI
 *  used to gate both on the text, so a prompts-only greeting vanished.
 */

import { resolveGreeting } from "../greeting.ts";

describe("resolveGreeting", () => {
  it("shows a text-only greeting with no prompts", () => {
    expect(resolveGreeting({ greeting: { text: "Hi, I'm Pip" } }, true)).toEqual({
      text: "Hi, I'm Pip",
      prompts: [],
    });
  });

  it("shows suggested prompts even when the greeting text is empty", () => {
    expect(
      resolveGreeting(
        { greeting: { text: "", suggestedPrompts: ["Tell me a joke", "Plan my day"] } },
        true,
      ),
    ).toEqual({
      text: null,
      prompts: ["Tell me a joke", "Plan my day"],
    });
  });

  it("shows both halves when both are set", () => {
    expect(
      resolveGreeting(
        { greeting: { text: "Hello", suggestedPrompts: ["Go"] } },
        true,
      ),
    ).toEqual({ text: "Hello", prompts: ["Go"] });
  });

  it("drops blank prompts and a whitespace-only text", () => {
    expect(
      resolveGreeting(
        { greeting: { text: "   ", suggestedPrompts: ["  ", "Go"] } },
        true,
      ),
    ).toEqual({ text: null, prompts: ["Go"] });
  });

  it("hides an entirely empty greeting", () => {
    expect(resolveGreeting({ greeting: { text: " ", suggestedPrompts: [] } }, true)).toBeUndefined();
  });

  it("hides the greeting once the thread has content", () => {
    expect(resolveGreeting({ greeting: { text: "Hi" } }, false)).toBeUndefined();
  });

  it("hides when no companion is bound", () => {
    expect(resolveGreeting(undefined, true)).toBeUndefined();
  });
});
