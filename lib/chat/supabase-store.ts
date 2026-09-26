/** Supabase chat store: sessions/messages with per-user RLS (ADR-0010).
 *
 * Row mappers are pure (tested); only the store class touches the
 * network through the injected client seam. The app never manages
 * schema — migrations apply via the Supabase SQL editor or CLI.
 *
 * Client shape is structural (from_/select/eq/order/limit/execute +
 * insert/update/delete/upsert/signInAnonymously) so node --test drives
 * the store with a dict-backed fake, never the network. The app wires
 * the real supabase-js client (lazy import, native-free under node).
 */

/** Newest 100 turns per session (backend parity: 50 exchanges). */
export const MAX_STORED_MESSAGES = 100;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
}

export type MessageRow = {
  session_id: string;
  role: string;
  content: string;
  type: string;
  metadata: string | null;
};

export type SessionRow = {
  id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
};

/** Turn -> messages insert payload. Metadata serializes to JSON. */
export function turnToRow(sessionId: string, turn: ChatTurn): MessageRow {
  return {
    session_id: sessionId,
    role: turn.role,
    content: turn.content,
    type: turn.type ?? "text",
    metadata:
      turn.metadata !== undefined && turn.metadata !== null
        ? JSON.stringify(turn.metadata)
        : null,
  };
}

/** messages row -> Turn. Corrupt metadata degrades to null, never throws. */
export function rowToTurn(row: Record<string, unknown>): ChatTurn {
  const metadata = row["metadata"];
  let parsed: Record<string, unknown> | null = null;
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    parsed = metadata as Record<string, unknown>;
  } else if (typeof metadata === "string") {
    try {
      const loaded: unknown = JSON.parse(metadata);
      parsed =
        typeof loaded === "object" && loaded !== null && !Array.isArray(loaded)
          ? (loaded as Record<string, unknown>)
          : null;
    } catch {
      parsed = null;
    }
  }
  const role = row["role"] === "assistant" ? "assistant" : "user";
  const content = typeof row["content"] === "string" ? row["content"] : "";
  const type = typeof row["type"] === "string" ? row["type"] : "text";
  return { role, content, type, metadata: parsed };
}

/** sessions row -> SessionRow. Pre-migration rows degrade to defaults. */
export function rowToSession(row: Record<string, unknown>): SessionRow {
  const title = row["title"];
  const pinned = row["pinned"];
  const updated = row["updated_at"];
  const id = typeof row["id"] === "string" ? row["id"] : "";
  return {
    id,
    title: typeof title === "string" ? title : "",
    pinned: typeof pinned === "boolean" ? pinned : false,
    updated_at: typeof updated === "string" ? updated : "",
  };
}

/** Thenable supabase-js chain: `await` resolves {data,error} directly.
 * Fake and real builders both fit (the adapter wraps the real one). */
export interface SupabaseQuery {
  select(columns: string): SupabaseQuery;
  insert(row: Record<string, unknown>): SupabaseQuery;
  update(row: Record<string, unknown>): SupabaseQuery;
  upsert(row: Record<string, unknown>): SupabaseQuery;
  delete(): SupabaseQuery;
  eq(column: string, value: string): SupabaseQuery;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQuery;
  limit(n: number): SupabaseQuery;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | Promise<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | Promise<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface SupabaseChatClient {
  from(table: string): SupabaseQuery;
}

/** Raw builder subset the adapter accepts (thenable at await). */
export interface RawSupabaseBuilder {
  select(columns: string): RawSupabaseBuilder;
  insert(row: Record<string, unknown>): RawSupabaseBuilder;
  update(row: Record<string, unknown>): RawSupabaseBuilder;
  upsert(row: Record<string, unknown>): RawSupabaseBuilder;
  delete(): RawSupabaseBuilder;
}

/** Wrap a raw supabase-js client into the structural seam. */
export function wrapSupabaseClient(raw: {
  from(table: string): RawSupabaseBuilder;
}): SupabaseChatClient {
  // SAFETY: supabase-js builders already carry .then resolving
  // {data,error}; the adapter only narrows their loose generics into
  // this file's structural chain (no SQL is built or skipped here).
  return {
    from: (table: string) => raw.from(table) as unknown as SupabaseQuery,
  };
}

function rowsOf(res: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (res.error) throw new Error("supabase request failed");
  if (!Array.isArray(res.data)) return [];
  return res.data.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Structural session store: SupabaseChatStore and test fakes both fit. */
export interface SessionStore {
  create(): Promise<string>;
  get(sessionId: string): Promise<ChatTurn[] | null>;
  append(sessionId: string, turn: ChatTurn): Promise<void>;
  listSessions(): Promise<SessionRow[]>;
  renameSession(sessionId: string, title: string): Promise<boolean>;
  setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean>;
  deleteSession(sessionId: string): Promise<boolean>;
  setTitleIfEmpty(sessionId: string, title: string): Promise<void>;
  popLastAssistant(sessionId: string): Promise<boolean>;
}

/** Durable conversation store on Supabase sessions/messages (RLS per user).
 * userId rides session inserts/upserts so the WITH CHECK policy passes;
 * message rows stay user-free (their policy joins through the session). */
export class SupabaseChatStore implements SessionStore {
  private readonly client: SupabaseChatClient;
  private readonly userId: string | null;
  constructor(client: SupabaseChatClient, userId: string | null = null) {
    this.client = client;
    this.userId = userId;
  }

  private sessionKey(): Record<string, unknown> {
    return this.userId ? { user_id: this.userId } : {};
  }

  async create(): Promise<string> {
    const sessionId = newId();
    const res = await this.client
      .from("sessions")
      .insert({ id: sessionId, ...this.sessionKey() });
    rowsOf(res);
    return sessionId;
  }

  async get(sessionId: string): Promise<ChatTurn[] | null> {
    const session = rowsOf(
      await this.client.from("sessions").select("id").eq("id", sessionId).limit(1),
    );
    if (session.length === 0) return null;
    const rows = rowsOf(
      await this.client
        .from("messages")
        .select("role,content,type,metadata")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MAX_STORED_MESSAGES),
    );
    return rows.reverse().map(rowToTurn);
  }

  async append(sessionId: string, turn: ChatTurn): Promise<void> {
    rowsOf(
      await this.client.from("sessions").upsert({ id: sessionId, ...this.sessionKey() }),
    );
    rowsOf(await this.client.from("messages").insert(turnToRow(sessionId, turn)));
  }

  async listSessions(): Promise<SessionRow[]> {
    const rows = rowsOf(
      await this.client
        .from("sessions")
        .select("id,title,pinned,updated_at")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
    );
    return rows.map(rowToSession);
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const rows = rowsOf(
      await this.client
        .from("sessions")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", sessionId),
    );
    return rows.length > 0;
  }

  async setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean> {
    const rows = rowsOf(
      await this.client
        .from("sessions")
        .update({ pinned, updated_at: new Date().toISOString() })
        .eq("id", sessionId),
    );
    return rows.length > 0;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    rowsOf(await this.client.from("messages").delete().eq("session_id", sessionId));
    const rows = rowsOf(
      await this.client.from("sessions").delete().eq("id", sessionId),
    );
    return rows.length > 0;
  }

  async setTitleIfEmpty(sessionId: string, title: string): Promise<void> {
    const rows = rowsOf(
      await this.client.from("sessions").select("id,title").eq("id", sessionId),
    );
    const current = rows.length > 0 ? rows[0]["title"] : undefined;
    if (current !== "" && current !== undefined) return;
    rowsOf(await this.client.from("sessions").update({ title }).eq("id", sessionId));
  }

  async popLastAssistant(sessionId: string): Promise<boolean> {
    const rows = rowsOf(
      await this.client
        .from("messages")
        .select("id,role")
        .eq("session_id", sessionId)
        .order("id", { ascending: false })
        .limit(1),
    );
    if (rows.length === 0 || rows[0]["role"] !== "assistant") return false;
    const id = rows[0]["id"];
    if (typeof id !== "string" && typeof id !== "number") return false;
    rowsOf(await this.client.from("messages").delete().eq("id", String(id)));
    return true;
  }
}
