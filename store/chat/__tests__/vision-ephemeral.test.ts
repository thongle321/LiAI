/** Vision mode must be STORE-LESS.
 *
 *  A live-camera Q&A leaves no chat session behind: no session row, the
 *  chat history never sees the turn, and the conversation is remembered
 *  only in the ephemeral vision memory (services/chat/vision-session.ts)
 *  that the mode clears on exit. Source-pattern pins (the behavior seams
 *  themselves are covered by vision-turn-runner.test.ts and
 *  vision-session.test.ts):
 *
 *  - useVisionTurn must not route through the chat store's send()
 *    — the pipeline that mints/adopts sessions and writes bubbles;
 *  - the ephemeral session id is the one sessionId the vision turn
 *    carries, and the memory module is the only history it reads.
 */

import { readSource } from "@/jest/source";

const turnSrc = readSource("hooks/useVisionTurn.ts");

describe("vision turns never land in the chat store", () => {
  it("useVisionTurn does not route through the chat store's send path", () => {
    // The store's send mints/adopts sessions and appends bubbles; any
    // use of it is a persisted session and a moved active pointer.
    expect(turnSrc).not.toMatch(/useChatStore/);
    expect(turnSrc).not.toMatch(/adoptSession/);
  });

  it("the vision turn runs store-less and reads the ephemeral memory", () => {
    expect(turnSrc).toMatch(/createVisionTurnRunner/);
    expect(turnSrc).toMatch(/visionHistory\(\)/);
    expect(turnSrc).toMatch(/visionRecord\(/);
    expect(turnSrc).toMatch(/voiceMode: true/);
  });

  it("exiting the mode clears the memory", () => {
    expect(turnSrc).toMatch(/visionReset\(/);
  });
});
