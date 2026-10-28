/** The vision tab's ephemeral conversation memory.
 *
 *  A vision-mode Q&A must leave NO chat session behind (no session row,
 *  the active pointer must never move, nothing in the chat history list),
 *  but the model still needs the recent questions to answer follow-ups
 *  ("what about now?"). This module keeps a bounded, in-memory rolling
 *  history that lives only as long as the mode — reset on exit.
 */

import {
  visionHistory,
  visionRecord,
  visionReset,
  visionRecordCount,
} from "../vision-session.ts";

describe("vision session memory", () => {
  beforeEach(() => visionReset());

  it("starts empty", () => {
    expect(visionHistory()).toEqual([]);
    expect(visionRecordCount()).toBe(0);
  });

  it("records the question and its reply as one usable turn", () => {
    visionRecord("What do you see?", "A yellow ball on the floor.");
    const history = visionHistory();
    expect(history.map((h) => [h.role, h.text])).toEqual([
      ["user", "What do you see?"],
      ["assistant", "A yellow ball on the floor."],
    ]);
  });

  it("follow-ups run on the previous turns", () => {
    visionRecord("What do you see?", "A yellow ball.");
    visionRecord("What about now?", "The ball is gone.");
    expect(visionHistory().length).toBe(4);
    expect(visionHistory()!.some((h) => h.text === "What about now?")).toBeTruthy();
  });

  it("keeps only the last six turns", () => {
    for (let i = 1; i <= 8; i += 1) visionRecord(`q${i}`, `a${i}`);
    expect(visionRecordCount()).toBe(12);
    expect(visionHistory()[0].text).toBe("q3");
    expect(visionHistory()[visionHistory().length - 1].text).toBe("a8");
  });

  it("resets on exit", () => {
    visionRecord("hi", "hello");
    visionReset();
    expect(visionRecordCount()).toBe(0);
    expect(visionHistory()).toEqual([]);
  });
});
