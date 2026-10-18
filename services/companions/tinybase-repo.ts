/** TinyBase-backed companion repository.
 *
 * Pure TinyBase, no native import — same split as
 * services/chat/tinybase-store.ts: this file takes a Store in its
 * constructor and the SQLite persister is wired in
 * services/chat/tinybase.ts, so the whole data layer runs under jest
 * against a bare `createStore()`.
 *
 * Store shape: ONE `companions` table, row id = companion id, ONE `data` cell
 * holding the JSON-serialized Companion. Twenty-five columns were possible;
 * one JSON cell matches how this repo already stores the sampler
 * override and the turn blocks, and a companion is read/written whole — no
 * query ever filters on a companion field (the grid filters in memory).
 */

import { type Store } from "tinybase";

import type { Companion, CompanionUpdate } from "@/types/companion.ts";
import type { CompanionRepository } from "./repository.ts";
import { newId } from "@/services/chat/messages.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Row -> Companion, with the fields every consumer relies on guaranteed.
 *  A malformed or unreadable cell reads as null rather than crashing
 *  the grid — a hand-edited or half-written row is data loss, not a
 *  crash. */
function companionFromRow(value: unknown): Companion | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || typeof parsed["id"] !== "string") return null;
    if (typeof parsed["name"] !== "string") return null;
    // SAFETY: the only unchecked claim is structural — id and name are
    // proven strings above, and every other field is optional on Companion, so
    // the row cannot hold a shape that breaks a consumer that trusts it.
    return parsed as unknown as Companion;
  } catch {
    return null;
  }
}

export class TinyBaseCompanionRepository implements CompanionRepository {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  private row(id: string): Companion | null {
    return companionFromRow(this.store.getCell("companions", id, "data"));
  }

  async list(): Promise<Companion[]> {
    const out: Companion[] = [];
    for (const id of Object.keys(this.store.getTable("companions"))) {
      const companion = this.row(id);
      if (companion !== null) out.push(companion);
    }
    // Oldest first: a stable grid order that matches creation order.
    return out.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  }

  async get(id: string): Promise<Companion | null> {
    return this.row(id);
  }

  async getByName(name: string): Promise<Companion | null> {
    const companions = await this.list();
    return companions.find((p) => p.name === name) ?? null;
  }

  async create(data: Omit<Companion, "id" | "created_at" | "updated_at">): Promise<Companion> {
    const now = new Date().toISOString();
    const companion: Companion = { ...data, id: newId(), created_at: now, updated_at: now };
    this.store.setCell("companions", companion.id, "data", JSON.stringify(companion));
    return companion;
  }

  async update(id: string, patch: CompanionUpdate): Promise<Companion> {
    const existing = this.row(id);
    if (existing === null) throw new Error(`companion not found: ${id}`);
    // Merge-patch per field: `undefined` leaves the stored value, `null`
    // erases a clearable field. Object spread would write `undefined`
    // over real values, which is exactly the bug the !== undefined gate
    // exists to prevent (PocketPal's per-field gates, same reason).
    const next: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === "id" || key === "created_at") continue;
      if (value === undefined) continue;
      if (value === null) delete next[key];
      else next[key] = value;
    }
    next["updated_at"] = new Date().toISOString();
    const updated = companionFromRow(JSON.stringify(next));
    if (updated === null) throw new Error(`companion patch erased required fields: ${id}`);
    this.store.setCell("companions", id, "data", JSON.stringify(next));
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    if (!this.store.hasRow("companions", id)) return false;
    this.store.delRow("companions", id);
    return true;
  }
}
