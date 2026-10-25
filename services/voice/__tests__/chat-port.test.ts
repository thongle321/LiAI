/** The chat-backed VoiceTurnPort: one spoken turn = chat send + speak.
 *
 *  Key rules: a refused send, a missing assistant row, an ERRORED row, and
 *  a blank successful reply all REJECT (the engine maps rejections to
 *  `reply_failed`); a settled turn raises the reply's text through BOTH
 *  `lastReply` (read after the fact) and `onReply` (once, as it settles so
 *  the caption can land while the speech is still running); and
 *  `waitIdle` lets a typed chat turn finish before the spoken send.
 */

import type { ChatMessage } from "@/types/chat.ts";
import {
  createChatTurnPort,
  type VoiceChatHand,
  type VoiceChatPort,
} from "@/services/voice/chat-port.ts";

function makeHand(over: Partial<VoiceChatHand> = {}): {
  port: VoiceChatPort;
  s: {
    spoken: string[];
    stops: number;
    ok: boolean;
  };
  say: (rows: ChatMessage[]) => void;
} {
  const s = {
    spoken: [] as string[],
    stops: 0,
    ok: true,
  };
  let messages: ChatMessage[] = [];
  const hand: VoiceChatHand = {
    send: async () => s.ok,
    stop: () => {
      s.stops += 1;
    },
    waitIdle: async () => {},
    messages: () => messages,
    speak: (text) => {
      s.spoken.push(text);
    },
    ...over,
  };
  return {
    port: createChatTurnPort(hand),
    s,
    say: (rows) => {
      messages = rows;
    },
  };
}

const row = (over: Partial<ChatMessage> & { id: string; role: ChatMessage["role"] }): ChatMessage => ({
  text: "",
  at: 0,
  ...over,
});

const HELLO_TURN = [
  row({ id: "u1", role: "user", text: "hello" }),
  row({ id: "a1", role: "assistant", text: "Hi there!" }),
];

describe("createChatTurnPort", () => {
  it("settles: reports the row id, raises the reply, speaks", async () => {
    const { port, s, say } = makeHand({
      send: async () => {
        say(HELLO_TURN);
        return true;
      },
    });
    const ids: string[] = [];
    await port.send("hello", (id) => void ids.push(id));

    expect(ids).toEqual(["a1"]);
    expect(s.spoken).toEqual(["Hi there!"]);
    expect(port.lastReply).toBe("Hi there!");
  });

  it("waits a busy chat turn before sending", async () => {
    const order: string[] = [];
    const rows: ChatMessage[] = [row({ id: "u0", role: "user", text: "old" })];
    const port = createChatTurnPort({
      send: async () => {
        order.push("send");
        rows.push(row({ id: "a1", role: "assistant", text: "ok" }));
        return true;
      },
      stop: () => {},
      waitIdle: async () => void order.push("wait"),
      messages: () => rows,
      speak: () => {},
    });
    await port.send("x", () => {});
    expect(order).toEqual(["wait", "send"]);
  });

  it("a refused send rejects and never speaks", async () => {
    const { port, s } = makeHand();
    s.ok = false;
    await expect(port.send("x", () => {})).rejects.toThrow("send refused");
    expect(s.spoken).toEqual([]);
    expect(port.lastReply).toBeNull();
  });

  it("no assistant row after a settled send rejects", async () => {
    const { port, s, say } = makeHand({
      send: async () => {
        say([row({ id: "u1", role: "user", text: "hello" })]);
        return true;
      },
    });
    await expect(port.send("hello", () => {})).rejects.toThrow();
    expect(s.spoken).toEqual([]);
  });

  it("an errored assistant row rejects", async () => {
    const { port, s, say } = makeHand({
      send: async () => {
        say([
          row({ id: "u1", role: "user", text: "hello" }),
          row({
            id: "a1",
            role: "assistant",
            text: "x",
            error: { message: "boom" } as never,
          }),
        ]);
        return true;
      },
    });
    await expect(port.send("hello", () => {})).rejects.toThrow("turn errored");
    expect(s.spoken).toEqual([]);
  });

  it("a blank successful reply rejects", async () => {
    const { port, say } = makeHand({
      send: async () => {
        say([
          row({ id: "u1", role: "user", text: "hello" }),
          row({ id: "a1", role: "assistant", text: "   " }),
        ]);
        return true;
      },
    });
    await expect(port.send("hello", () => {})).rejects.toThrow("empty reply");
  });

  it("onReply fires once with the settled text", async () => {
    const seen: string[] = [];
    const { port, say } = makeHand({
      send: async () => {
        say(HELLO_TURN);
        return true;
      },
    });
    port.onReply = (text) => void seen.push(text);
    await port.send("hello", () => {});
    expect(seen).toEqual(["Hi there!"]);
  });

  it("a rejected turn resets lastReply", async () => {
    const { port, s, say } = makeHand({
      send: async () => {
        say(HELLO_TURN);
        return true;
      },
    });
    await port.send("hello", () => {});
    expect(port.lastReply).toBe("Hi there!");

    s.ok = false;
    await expect(port.send("again", () => {})).rejects.toThrow();
    expect(port.lastReply).toBeNull();
  });
});
