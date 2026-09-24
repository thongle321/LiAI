/** SSE stream parser (pure): text chunks -> typed chat events.
 *
 * Mirrors the backend wire format (backend/app/modules/chat/internal/sse.py):
 * one `event: <name>` line plus a single-line JSON `data:` line per block,
 * blocks separated by blank lines. Unknown events and malformed blocks
 * return null so the stream survives server-side additions.
 */

export type ChatStreamEvent =
  | { type: "start"; sessionId: string }
  | { type: "token"; text: string }
  | {
      type: "tool";
      name: string;
      status: "running" | "done";
      /** Wire identity for running→done upserts (backend tool_call_id). */
      id: string;
      input?: Record<string, unknown>;
      result?: string;
    }
  | {
      type: "usage";
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }
  | { type: "done"; sessionId: string }
  | { type: "error"; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Parse one complete SSE block; null when it carries nothing usable. */
export function parseSseBlock(block: string): ChatStreamEvent | null {
  let name = "";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      name = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      const rest = line.slice("data:".length);
      dataLines.push(rest.startsWith(" ") ? rest.slice(1) : rest);
    }
  }
  if (name === "" || dataLines.length === 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;

  switch (name) {
    case "start": {
      const sessionId = asString(payload["session_id"]);
      return sessionId !== null ? { type: "start", sessionId } : null;
    }
    case "token": {
      const text = asString(payload["text"]);
      return text !== null ? { type: "token", text } : null;
    }
    case "tool": {
      const toolName = asString(payload["name"]);
      if (toolName === null) return null;
      // The backend always sends status + id (construction-guaranteed);
      // a block missing either is malformed, not tolerated.
      const rawStatus = payload["status"];
      if (rawStatus !== "running" && rawStatus !== "done") return null;
      const id = asString(payload["id"]);
      if (id === null) return null;
      const rawInput = payload["input"];
      let input: Record<string, unknown> | undefined;
      if (rawInput !== undefined) {
        if (!isRecord(rawInput)) return null;
        input = rawInput;
      }
      const rawResult = payload["result"];
      let result: string | undefined;
      if (rawResult !== undefined) {
        const text = asString(rawResult);
        if (text === null) return null;
        result = text;
      }
      return {
        type: "tool",
        name: toolName,
        status: rawStatus,
        id,
        ...(input !== undefined ? { input } : {}),
        ...(result !== undefined ? { result } : {}),
      };
    }
    case "usage": {
      const promptTokens = asNumber(payload["prompt_tokens"]);
      const completionTokens = asNumber(payload["completion_tokens"]);
      const totalTokens = asNumber(payload["total_tokens"]);
      return promptTokens !== null &&
        completionTokens !== null &&
        totalTokens !== null
        ? { type: "usage", promptTokens, completionTokens, totalTokens }
        : null;
    }
    case "done": {
      const sessionId = asString(payload["session_id"]);
      return sessionId !== null ? { type: "done", sessionId } : null;
    }
    case "error": {
      const code = asString(payload["code"]);
      const message = asString(payload["message"]);
      return code !== null && message !== null
        ? { type: "error", code, message }
        : null;
    }
    default:
      return null;
  }
}

/** Incremental feeder for XHR progress chunks: complete blocks resolve to
 * events, the trailing partial block stays buffered for the next push. */
export function createSseAccumulator(): {
  push(chunk: string): ChatStreamEvent[];
} {
  let buffer = "";
  return {
    push(chunk: string): ChatStreamEvent[] {
      buffer += chunk;
      const events: ChatStreamEvent[] = [];
      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const event = parseSseBlock(buffer.slice(0, idx));
        if (event !== null) events.push(event);
        buffer = buffer.slice(idx + 2);
        idx = buffer.indexOf("\n\n");
      }
      return events;
    },
  };
}
