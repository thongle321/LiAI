/** Companion persistence port — the mirror of the chat `SessionStore` port
 *  (ADR-0012's seam pattern): the app talks to this interface, tests
 *  inject a fake, and the TinyBase implementation is swappable without
 *  touching a store or a screen.
 *
 *  Deliberately local: no identity, no remote owner. A companion lives on
 *  exactly one device.
 */

import type { Companion, CompanionUpdate } from "@/types/companion.ts";

export interface CompanionRepository {
  /** Every installed companion, oldest first (stable grid order). */
  list(): Promise<Companion[]>;
  /** One companion, or null when the id is unknown. */
  get(id: string): Promise<Companion | null>;
  /** First local companion with this exact name, or null. Used by builtin
   *  seeding, which must not create a second Pip. */
  getByName(name: string): Promise<Companion | null>;
  /** Mint an id + timestamps and persist. Returns the stored companion. */
  create(data: Omit<Companion, "id" | "created_at" | "updated_at">): Promise<Companion>;
  /** Merge-patch: `undefined` fields leave the stored value untouched,
   *  `null` ERASES a clearable field (greeting, defaultModel). Throws
   *  when the id is unknown — a patch on nothing is a bug to surface,
   *  not a silent no-op. */
  update(id: string, patch: CompanionUpdate): Promise<Companion>;
  /** False when the id did not exist. */
  remove(id: string): Promise<boolean>;
}
