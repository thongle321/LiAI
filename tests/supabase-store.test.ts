/** Supabase chat store: sessions/messages with per-user RLS (TDD).
 * Run: node --test frontend/tests/supabase-store.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rowToSession,
  rowToTurn,
  SupabaseChatStore,
  turnToRow,
  type SupabaseChatClient,
} from "../lib/chat/supabase-store.ts";

/** Dict-backed PostgREST chain: proves order/limit/metadata offline. */
function fakeClient(): SupabaseChatClient & {
  sessions: Record<string, unknown>[];
  messages: Record<string, unknown>[];
} {
  const sessions: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  let nextId = 1;
  const table = (name: string) => (name === "sessions" ? sessions : messages);
  const chain = (name: string) => {
    let op = "";
    let payload: Record<string, unknown> = {};
    const filters: Array<[string, string]> = [];
    const orders: Array<{ column: string; ascending: boolean }> = [];
    let limit: number | null = null;
    const q = {
      select() {
        op = "select";
        return q;
      },
      insert(row: Record<string, unknown>) {
        op = "insert";
        payload = row;
        return q;
      },
      update(row: Record<string, unknown>) {
        op = "update";
        payload = row;
        return q;
      },
      upsert(row: Record<string, unknown>) {
        op = "upsert";
        payload = row;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq(column: string, value: string) {
        filters.push([column, value]);
        return q;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        orders.push({ column, ascending: opts?.ascending ?? true });
        return q;
      },
      limit(n: number) {
        limit = n;
        return q;
      },
      // Thenable like the real supabase-js builder: `await` resolves
      // {data,error} directly. Synchronous compute wrapped so every path
      // returns a real promise for the store's awaits.
      then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
        onFulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | Promise<TResult1>) | null,
      ): Promise<TResult1 | TResult2> {
        const run = (): { data: unknown; error: unknown } => {
          const rows = table(name);
          const match = (row: Record<string, unknown>) =>
            filters.every(([c, v]) => String(row[c] ?? "") === v);
          if (op === "insert") {
            const row = { ...payload };
            if (name === "messages" && row["id"] === undefined) {
              row["id"] = nextId++;
            }
            rows.push(row);
            return { data: [row], error: null };
          }
          if (op === "upsert") {
            const id = String(payload["id"] ?? "");
            if (!rows.some((r) => String(r["id"] ?? "") === id)) rows.push({ ...payload });
            return { data: [{ ...payload }], error: null };
          }
          if (op === "delete") {
            const removed = rows.filter(match);
            for (const row of removed) rows.splice(rows.indexOf(row), 1);
            return { data: removed, error: null };
          }
          let out = rows.filter(match);
          if (op === "update") {
            for (const row of out) Object.assign(row, payload);
            return { data: out.map((r) => ({ ...r })), error: null };
          }
          const compareValues = (x: unknown, y: unknown): number => {
            if (typeof x === "number" && typeof y === "number") return x - y;
            const xs = String(x ?? "");
            const ys = String(y ?? "");
            return xs < ys ? -1 : xs > ys ? 1 : 0;
          };
          for (const { column, ascending } of [...orders].reverse()) {
            out = [...out].sort((a, b) => {
              const cmp = compareValues(a[column], b[column]);
              return ascending ? cmp : -cmp;
            });
          }
          if (limit !== null) out = out.slice(0, limit);
          return { data: out.map((r) => ({ ...r })), error: null };
        };
        const outcome = run();
        if (!onFulfilled) return Promise.resolve(outcome) as Promise<TResult1 | TResult2>;
        return Promise.resolve(onFulfilled(outcome));
      },
    };
    return q;
  };
  return {
    sessions,
    messages,
    from: (name: string) => chain(name),
  };
}

describe("turnToRow", () => {
  it("serializes metadata to a JSON string", () => {
    const row = turnToRow("s1", {
      role: "assistant",
      content: "hi",
      type: "text",
      metadata: { tool_calls: ["calculate"] },
    });
    assert.equal(row.session_id, "s1");
    assert.equal(row.role, "assistant");
    assert.equal(
      row.metadata,
      JSON.stringify({ tool_calls: ["calculate"] }),
    );
  });

  it("leaves absent metadata absent", () => {
    const row = turnToRow("s1", { role: "user", content: "q", type: "text" });
    assert.equal(row.metadata, null);
  });
});

describe("rowToTurn", () => {
  it("parses string metadata back to an object", () => {
    const turn = rowToTurn({
      role: "assistant",
      content: "hi",
      type: "text",
      metadata: JSON.stringify({ tool_calls: ["datetime"] }),
    });
    assert.deepEqual(turn.metadata, { tool_calls: ["datetime"] });
  });

  it("degrades corrupt metadata to null, never throws", () => {
    const turn = rowToTurn({
      role: "assistant",
      content: "hi",
      type: "text",
      metadata: "{bad",
    });
    assert.equal(turn.metadata, null);
  });

  it("defaults a missing type to text", () => {
    const turn = rowToTurn({ role: "user", content: "q" });
    assert.equal(turn.type, "text");
  });
});

describe("rowToSession", () => {
  it("maps a full session row", () => {
    assert.deepEqual(
      rowToSession({ id: "s1", title: "T", pinned: true, updated_at: "t" }),
      { id: "s1", title: "T", pinned: true, updated_at: "t" },
    );
  });

  it("degrades pre-migration rows to defaults", () => {
    assert.deepEqual(rowToSession({ id: "s1" }), {
      id: "s1",
      title: "",
      pinned: false,
      updated_at: "",
    });
  });
});

describe("SupabaseChatStore user isolation", () => {
  it("writes user_id on session inserts when one is set", async () => {
    const fake = fakeClient();
    const store = new SupabaseChatStore(fake, "user-1");
    const id = await store.create();
    assert.equal(fake.sessions.find((s) => s["id"] === id)?.["user_id"], "user-1");
  });

  it("omits user_id when anonymous without an id", async () => {
    const fake = fakeClient();
    const store = new SupabaseChatStore(fake);
    const id = await store.create();
    assert.ok(!("user_id" in (fake.sessions.find((s) => s["id"] === id) ?? {})));
  });
});

describe("SupabaseChatStore via fake client", () => {
  it("returns null for a missing session", async () => {
    const store = new SupabaseChatStore(fakeClient());
    assert.equal(await store.get("nope"), null);
  });

  it("appends two turns and reads them back with metadata", async () => {
    const store = new SupabaseChatStore(fakeClient());
    const id = await store.create();
    await store.append(id, { role: "user", content: "time?", type: "text" });
    await store.append(id, {
      role: "assistant",
      content: "noon",
      type: "text",
      metadata: { tool_calls: ["datetime"] },
    });
    const turns = await store.get(id);
    assert.equal(turns?.length, 2);
    assert.deepEqual(turns?.[1].metadata, { tool_calls: ["datetime"] });
  });

  it("caps a session at the newest 100 turns", async () => {
    const store = new SupabaseChatStore(fakeClient());
    const id = await store.create();
    for (let i = 0; i < 105; i++) {
      await store.append(id, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: `m${i}`,
        type: "text",
      });
    }
    const turns = await store.get(id);
    assert.equal(turns?.length, 100);
    assert.equal(turns?.[0].content, "m5");
    assert.equal(turns?.[99].content, "m104");
  });

  it("renames, pins, titles-if-empty, and deletes sessions", async () => {
    const store = new SupabaseChatStore(fakeClient());
    const id = await store.create();
    await store.setTitleIfEmpty(id, "First");
    await store.setTitleIfEmpty(id, "Second");
    assert.equal((await store.listSessions())[0].title, "First");
    assert.equal(await store.renameSession(id, "Renamed"), true);
    assert.equal(await store.setSessionPinned(id, true), true);
    const [row] = await store.listSessions();
    assert.equal(row.title, "Renamed");
    assert.equal(row.pinned, true);
    assert.equal(await store.deleteSession(id), true);
    assert.deepEqual(await store.listSessions(), []);
  });

  it("pops the last assistant turn only", async () => {
    const store = new SupabaseChatStore(fakeClient());
    const id = await store.create();
    await store.append(id, { role: "user", content: "q", type: "text" });
    assert.equal(await store.popLastAssistant(id), false);
    await store.append(id, { role: "assistant", content: "a", type: "text" });
    assert.equal(await store.popLastAssistant(id), true);
    assert.deepEqual(
      (await store.get(id))?.map((t) => t.role),
      ["user"],
    );
  });
});
