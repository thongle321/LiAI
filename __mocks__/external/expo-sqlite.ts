/** Jest mock for `expo-sqlite` (services/chat/tinybase.ts, the SQLite persister wiring).
 *
 * The app is careful never to import this statically from anything a test
 * reaches (see services/chat/tinybase.ts's dynamic import), so this mock exists for a
 * test that DOES reach it: opening a database rejects with a plain Error
 * rather than resolving to a half-working fake and hanging the suite.
 *
 * That rejection is what makes `services/chat/tinybase.ts` degrade the documented way:
 * `open()` catches, clears its memo, and `getSessionStore()` resolves to
 * null — chat runs with no persistence instead of throwing.
 */

export const openDatabaseAsync = jest.fn(
  (_name?: string): Promise<never> =>
    Promise.reject(new Error("expo-sqlite: no database is available under Jest")),
);

export const openDatabaseSync = jest.fn((): never => {
  throw new Error("expo-sqlite: openDatabaseSync is unavailable under Jest");
});

export const deleteDatabaseAsync = jest.fn(async (): Promise<void> => {});

export default {
  openDatabaseAsync,
  openDatabaseSync,
  deleteDatabaseAsync,
};
