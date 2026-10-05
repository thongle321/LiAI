/** Import a conversation exported by `export.ts` back into the app.
 *
 * Pure, for the same reason export.ts is: the schema is the risky half
 * and it must be pinned by tests rather than discovered by handing a
 * malformed file to a device.
 *
 * THIS IS A TRUST BOUNDARY. The file is user-supplied and may be
 * truncated, hand-edited, or hostile. Three rules follow from that and
 * are the whole design:
 *
 * 1. NOTHING IS TRUSTED BY SHAPE. Every field is checked and re-built
 *    field by field; the parsed object is never spread through. A turn is
 *    reconstructed as a fresh StoredTurn, which means an `id` in the file
 *    is dropped by construction rather than by a filter someone can
 *    forget. Import MUST mint fresh ids: two imports of the same backup
 *    would otherwise collide on row ids and overwrite each other.
 *
 * 2. EVERYTHING IS BOUNDED. Sizes, turn counts and content lengths are
 *    capped, so a file claiming a million turns cannot exhaust memory on
 *    a phone that is already holding several GB of GGUF.
 *
 * 3. A BAD TURN IS SKIPPED, NOT FATAL. PocketPal reports a partial-import
 *    count rather than rejecting a whole backup because one message is
 *    malformed -- the user's other messages are worth keeping.
 *
 * Markdown is deliberately NOT importable: it is a lossy, human-facing
 * rendering with no steps or usage, so importing it would invent data the
 * file does not contain. The restore path is JSON, which is what
 * `toSessionJson` / `toAllSessionsJson` produce.
 */

import type { StoredTurn } from "./session-store.ts";
import { newId } from "./messages.ts";
import type { AgentStep } from "../../types/chat.ts";

/** Bounds. Deliberately generous -- these exist to stop a hostile or
 *  corrupt file, not to second-guess a real backup. */
const MAX_SESSIONS = 200;
const MAX_TURNS_PER_SESSION = 2000;
const MAX_TURNS_TOTAL = 10_000;
const MAX_CONTENT_CHARS = 100_000;
const MAX_TITLE_CHARS = 200;
const MAX_STEPS_PER_TURN = 50;
const MAX_TOOL_CHARS = 80;

/** Only version 1 exists. A file from the future is refused rather than
 *  best-effort parsed: guessing at fields we do not know is how silent
 *  data loss happens. */
const SUPPORTED_VERSION = 1;

export interface ImportedSession {
  title: string;
  pinned: boolean;
  /** StoredTurn, never StoredMessage -- import mints its own ids. */
  turns: StoredTurn[];
}

export type ImportOutcome =
  | { ok: true; sessions: ImportedSession[]; skipped: number }
  | { ok: false; error: string };

/** What the store reports back once a validated file has been written. */
export interface ImportResult {
  ok: boolean;
  /** Conversations actually created. */
  imported: number;
  /** Messages refused as malformed, and sessions dropped entirely. */
  skipped: number;
  /** Present only when ok is false. */
  error?: string;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.length > max ? value.slice(0, max) : value;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Rebuild one tool call, or null when it is unusable.
 *
 *  THE ID IS ALWAYS MINTED, NEVER READ. `step.id` is the TinyBase row key
 *  for the toolRuns table (tinybase-store.ts writes `setRow("toolRuns",
 *  step.id, …)`), and that table is GLOBAL, not scoped per conversation.
 *  So an id taken from the file is not a display detail -- importing the
 *  same backup twice would point both conversations at the SAME rows, and
 *  a hostile file naming an existing row would overwrite another
 *  conversation's tool calls. Same rule as turns, and for the same reason.
 *
 *  `ok` is preserved because it IS the record of a failure. Dropping it
 *  would silently repaint a failed call as a successful one. */
function toStep(value: unknown, position: number): AgentStep | null {
  if (!isRecord(value)) return null;
  const tool = str(value.tool, MAX_TOOL_CHARS);
  if (tool === null || tool === "") return null;
  // Position is the call order, and the store has no other ordering key.
  // Fall back to the array position when the file omits it.
  const at = typeof value.position === "number" && Number.isFinite(value.position)
    ? value.position
    : position;

  const result = str(value.result, MAX_CONTENT_CHARS);
  return {
    id: newId(),
    tool,
    position: at,
    ...(isRecord(value.input) ? { input: value.input } : {}),
    ...(result !== null ? { result } : {}),
    ...(typeof value.ok === "boolean" ? { ok: value.ok } : {}),
    ...(isRecord(value.data) ? { data: value.data } : {}),
  };
}

/** Rebuild one turn, or null when it is unusable. Note there is no
 *  `...(turn as StoredTurn)` anywhere in this file: the spread is what
 *  would smuggle an attacker-supplied `id` into the store.
 *
 *  `droppedRich` is the honest part. `export.ts` writes reasoning, usage,
 *  tool steps and outcome flags, and this validator does not restore them
 *  -- carrying untrusted AgentStep/usage graphs through would need its own
 *  structural validation, which is not something to bolt on beside a
 *  security fix. Silently discarding them while reporting `skipped: 0`
 *  would be the same class of mistake the module exists to avoid: a
 *  restore that quietly loses data and claims it kept everything. So they
 *  are counted and the user is told. */
function toTurn(
  value: unknown,
): { turn: StoredTurn; droppedRich: boolean; droppedSteps: number } | null {
  if (!isRecord(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  const content = str(value.content, MAX_CONTENT_CHARS);
  if (content === null) return null;
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null;

  // `type` is optional in the format; default to text rather than
  // dropping turns written before it existed.
  const type = value.type === "error" ? "error" : "text";

  const droppedRich =
    value.reasoning !== undefined ||
    value.usage !== undefined ||
    value.outcome !== undefined;

  // Tool calls are RESTORED, not dropped -- they are the whole point of
  // this spec. `ok` survives, so a failed call stays a failed call.
  let droppedSteps = 0;
  const rawSteps = value.steps;
  const steps: AgentStep[] = [];
  if (Array.isArray(rawSteps)) {
    let skippedSteps = 0;
    for (const [i, raw] of rawSteps.slice(0, MAX_STEPS_PER_TURN).entries()) {
      const step = toStep(raw, i);
      if (step === null) skippedSteps += 1;
      else steps.push(step);
    }
    if (rawSteps.length > MAX_STEPS_PER_TURN) {
      skippedSteps += rawSteps.length - MAX_STEPS_PER_TURN;
    }
    if (skippedSteps > 0) droppedSteps += skippedSteps;
  }

  const turn: StoredTurn = {
    role: value.role,
    content,
    at: value.at,
    type,
  };
  if (steps.length > 0) turn.steps = steps;
  // No image handling: `StoredTurn` has no image field, so export.ts
  // never writes one and an import cannot restore a photo that was never
  // in the file. Inventing one would be data the backup does not contain.
  return { turn, droppedRich, droppedSteps };
}

/** One session, or null when even its shape is wrong. Turns inside are
 *  skipped individually. */
function toSession(value: unknown): { session: ImportedSession; skipped: number } | null {
  if (!isRecord(value)) return null;
  const title = str(value.title, MAX_TITLE_CHARS);
  if (title === null) return null;
  const rawTurns = value.turns;
  if (!Array.isArray(rawTurns)) return null;

  const turns: StoredTurn[] = [];
  let skipped = 0;
  for (const raw of rawTurns) {
    if (turns.length >= MAX_TURNS_PER_SESSION) {
      skipped += 1;
      continue;
    }
    const turn = toTurn(raw);
    if (turn === null) skipped += 1;
    else {
      turns.push(turn.turn);
      if (turn.droppedRich) skipped += 1;
      skipped += turn.droppedSteps;
    }
  }
  if (turns.length === 0) return null;
  return {
    session: {
      // A blank title would make the conversation unreadable in the list,
      // so give it something honest rather than showing nothing.
      title: title.trim() === "" ? "Imported chat" : title.trim(),
      pinned: value.pinned === true,
      turns,
    },
    skipped,
  };
}

export function parseImport(text: string): ImportOutcome {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!isRecord(root)) return { ok: false, error: "That isn't a LiAI chat backup." };
  if (root.version !== SUPPORTED_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version. This app reads version ${SUPPORTED_VERSION}.`,
    };
  }

  const containers: unknown[] = [];
  const skippedBefore: number[] = [];
  if (root.format === "liai-chat-session") {
    containers.push(root);
  } else if (root.format === "liai-chat-sessions") {
    if (!Array.isArray(root.sessions)) {
      return { ok: false, error: "That backup has no sessions list." };
    }
    // NOT `push(...root.sessions)`: spreading an untrusted array into a
    // call overflows the stack around ~100k entries, and that RangeError
    // is thrown OUTSIDE the JSON try/catch, so it escapes as a crash
    // instead of a clean rejection. A hostile file should be refused, not
    // crash the app.
    for (const s of root.sessions.slice(0, MAX_SESSIONS)) containers.push(s);
    if (root.sessions.length > MAX_SESSIONS) skippedBefore.push(root.sessions.length - MAX_SESSIONS);
  } else {
    return { ok: false, error: "That file isn't a LiAI chat backup." };
  }

  const sessions: ImportedSession[] = [];
  let skipped = skippedBefore.reduce((a, b) => a + b, 0);
  let totalTurns = 0;
  for (const container of containers) {
    if (sessions.length >= MAX_SESSIONS) {
      skipped += 1;
      continue;
    }
    const parsed = toSession(container);
    if (parsed === null) {
      skipped += 1;
      continue;
    }
    if (totalTurns + parsed.session.turns.length > MAX_TURNS_TOTAL) {
      skipped += 1;
      continue;
    }
    totalTurns += parsed.session.turns.length;
    skipped += parsed.skipped;
    sessions.push(parsed.session);
  }

  if (sessions.length === 0) {
    return { ok: false, error: "That backup has no importable conversations." };
  }
  return { ok: true, sessions, skipped };
}