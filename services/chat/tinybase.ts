/** TinyBase Store + SQLite persister — the app's only chat persistence
 * (ADR-0012, supersedes ADR-0010).
 *
 * DEVICE ONLY: this module imports expo-sqlite, a native module, so it is
 * never imported statically. store/chat/index.ts pulls it in with a
 * dynamic import, which keeps every jest run native-free. The data
 * layer itself lives in services/chat//tinybase-store.ts and IS tested in node.
 *
 * `startAutoPersisting` loads first and only then starts saving. That
 * order is not a detail: a persister that saves before it loads writes
 * the empty in-memory Store over everything already on disk.
 */

import * as SQLite from "expo-sqlite";
import { createExpoSqlitePersister } from "tinybase/persisters/persister-expo-sqlite";

import { createChatStore, TinyBaseSessionStore } from "./tinybase-store.ts";
import type { SessionStore } from "./session-store.ts";

const DATABASE_NAME = "liai-chat.db";

/** Memoised so the Store is created once per process: two Stores over
 *  one database would each autosave and fight the other's writes. */
let pending: Promise<SessionStore | null> | null = null;

export function getSessionStore(): Promise<SessionStore | null> {
  pending ??= open();
  return pending;
}

async function open(): Promise<SessionStore | null> {
  try {
    const store = createChatStore();
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    const persister = createExpoSqlitePersister(store, db);
    await persister.startAutoPersisting();
    return new TinyBaseSessionStore(store);
  } catch (error) {
    // A failed open must not wedge the app for the rest of the session:
    // clear the memo so a later call (a retry, a remount) can try again,
    // and let the chat store fall back to no persistence.
    pending = null;
    console.warn("[chat] local store unavailable:", error);
    return null;
  }
}
