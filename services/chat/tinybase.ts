/** TinyBase Store + SQLite persister — the app's only chat persistence
 * (ADR-0012, supersedes ADR-0010).
 *
 * DEVICE ONLY: this module imports expo-sqlite, a native module, so it is
 * never imported statically. store/chat/index.ts pulls it in with a
 * dynamic import, which keeps every jest run native-free. The data
 * layer itself lives in services/chat//tinybase-store.ts and
 * services/companions//tinybase-repo.ts, and both ARE tested in node.
 *
 * ONE Store serves both repositories (chat + companions): two Stores over one
 * database would each autosave and fight the other's writes, and the
 * session→companion binding only means anything when both tables live in the
 * same persisted store.
 *
 * `startAutoPersisting` loads first and only then starts saving. That
 * order is not a detail: a persister that saves before it loads writes
 * the empty in-memory Store over everything already on disk.
 */

import * as SQLite from "expo-sqlite";
import { createExpoSqlitePersister } from "tinybase/persisters/persister-expo-sqlite";

import { createChatStore, TinyBaseSessionStore } from "./tinybase-store.ts";
import type { SessionStore } from "./session-store.ts";
import type { CompanionRepository } from "@/services/companions/repository.ts";
import { TinyBaseCompanionRepository } from "@/services/companions/tinybase-repo.ts";

const DATABASE_NAME = "liai-chat.db";

interface ChatDb {
  session: SessionStore;
  companions: CompanionRepository;
}

/** Memoised so the Store is created once per process. On a failed open
 *  the memo clears so a later call (a retry, a remount) can try again. */
let pending: Promise<ChatDb | null> | null = null;

export function getSessionStore(): Promise<SessionStore | null> {
  return db().then((db) => (db === null ? null : db.session));
}

export function getCompanionRepository(): Promise<CompanionRepository | null> {
  return db().then((db) => (db === null ? null : db.companions));
}

function db(): Promise<ChatDb | null> {
  pending ??= open();
  return pending;
}

async function open(): Promise<ChatDb | null> {
  try {
    const store = createChatStore();
    const sqlite = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const persister = createExpoSqlitePersister(store, sqlite);
    await persister.startAutoPersisting();
    return {
      session: new TinyBaseSessionStore(store),
      companions: new TinyBaseCompanionRepository(store),
    };
  } catch (error) {
    // A failed open must not wedge the app for the rest of the session:
    // clear the memo so a later call (a retry, a remount) can try again,
    // and let the chat store fall back to no persistence.
    pending = null;
    console.warn("[chat] local store unavailable:", error);
    return null;
  }
}
