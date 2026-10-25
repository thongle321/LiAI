/** Screen wake lock for a running local turn (audit G2).
 *
 * A long on-device generation can outlast the screen timeout, so the
 * device sleeps mid-answer and the user comes back to a half-rendered
 * bubble with no way to tell whether the turn finished. Holding the
 * screen awake from send until the run settles closes that.
 *
 * The import is DYNAMIC for the same reason services/chat/tinybase.ts's is: this
 * module sits in the chat store's dependency graph, and plain-Node tests
 * import that graph. expo-keep-awake is a native module, so a static
 * import would fail the test run. Metro still bundles it statically for
 * the app.
 *
 * Released early on Stop rather than waiting for the engine to settle —
 * PocketPal does the same (pocketpal-ai/src/hooks/useChatSession.ts:928-934)
 * — because waiting means the screen sleeps during exactly the teardown
 * the user just asked for.
 */

/** Tag, so this lock can never collide with another holder's. Each holder
 *  creates its own lock over the SAME native module but a distinct tag:
 *  releasing the chat turn's lock leaves a voice session's hold intact. */
const TAG = "liai-chat-turn";

export type KeepAwake = typeof import("expo-keep-awake");

/**
 * The lock, built over an injected loader and tag.
 *
 * The loader is a parameter purely so the race below is testable — the
 * five cases in tests/chat-keep-awake.test.ts exercise the STORE's
 * ordering, and they inject `keepAwake`, so without this seam nothing
 * would cover the module's own logic. Production passes the real loader.
 */
export function createKeepAwake(
  load: () => Promise<KeepAwake>,
  tag: string = TAG,
) {
  /** The loaded module, kept after the first success: re-importing per
   *  turn buys nothing and makes the release path depend on the import
   *  resolving again. */
  let mod: KeepAwake | null = null;
  let held = false;

  /**
   * Cancels an in-flight hold. A bare boolean cannot do this:
   * `holdScreen` must await before activating, so a release issued during
   * that window would be undone when the hold resumed — stranding the
   * screen awake with nothing left to release it. Every hold takes a
   * ticket; a release bumps the counter, and a hold that finds its ticket
   * stale at EITHER await point backs out.
   */
  let epoch = 0;

  async function holdScreen(): Promise<void> {
    if (held) return;
    const ticket = (epoch += 1);
    try {
      mod ??= await load();
      if (ticket !== epoch) return;
      await mod.activateKeepAwakeAsync(tag);
      if (ticket !== epoch) {
        // Released while activating: undo the lock we just took, or it is
        // held with no owner left to release it.
        mod.deactivateKeepAwake(tag);
        return;
      }
      held = true;
    } catch {
      // A platform that refuses the lock is not a reason to fail the
      // turn. `held` stays false so a later turn tries again.
    }
  }

  function releaseScreen(): void {
    // Cancel first, and unconditionally: this is what makes an in-flight
    // hold give up instead of stranding the lock.
    epoch += 1;
    if (!held) return;
    held = false;
    try {
      mod?.deactivateKeepAwake(tag);
    } catch {
      // Nothing to release if the module never loaded.
    }
  }

  return { holdScreen, releaseScreen };
}

/** The app's lock: the real module, loaded on first use. */
const lock = createKeepAwake(() => import("expo-keep-awake"));

export const holdScreen = lock.holdScreen;
export const releaseScreen = lock.releaseScreen;