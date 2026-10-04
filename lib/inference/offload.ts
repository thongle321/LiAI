/** Background handling for the loaded model.
 *
 * The app had no AppState listener at all, so a multi-GB GGUF stayed
 * resident until the user deactivated the model by hand. This releases it
 * when the app is backgrounded, unless the user turned that off — on a
 * phone, holding the model is what gets the process killed, and a reload on
 * the next message is a smaller cost than that.
 *
 * The AppState source is injected so the decision is testable without a
 * native module.
 */

export interface AppStateLike {
  addEventListener(
    type: "change",
    handler: (status: string) => void,
  ): { remove: () => void };
}

/** Holds on background release while a SYSTEM UI is in the foreground.
 *
 * Opening the camera or the gallery backgrounds the app, so the listener
 * below would free the model mid-pick — and the send that follows turns
 * into a load-then-fail, or an Android OOM. The caller brackets the pick
 * with this and releases the handle afterwards.
 *
 * A counter, not a boolean: pickers can overlap (a permission prompt on
 * top of the gallery), and a boolean would let the inner one resume the
 * world while the outer pick is still open.
 */
let suspensions = 0;

/** Not exported: the counter is observable only through
 *  `watchBackgroundRelease`, which is where the decision that matters is
 *  made. An exported predicate with no production caller is surface the
 *  app does not need. */
function isBackgroundReleaseSuspended(): boolean {
  return suspensions > 0;
}

/** Returns an idempotent resume handle. Calling it twice is safe: the
 *  counter must never go negative, or every later suspension would be
 *  silently cancelled by the stray decrement. */
export function suspendBackgroundRelease(): () => void {
  suspensions += 1;
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    suspensions -= 1;
  };
}

/** Subscribe; returns an unsubscribe. Only `background` releases — an
 *  `inactive` blip (a phone call, the app switcher) must not cost a
 *  reload. A suspended release is skipped too (see G14). */
export function watchBackgroundRelease(
  source: AppStateLike,
  opts: { isEnabled: () => boolean; release: () => void },
): () => void {
  const subscription = source.addEventListener("change", (status) => {
    if (status !== "background") return;
    if (isBackgroundReleaseSuspended()) return;
    if (opts.isEnabled()) opts.release();
  });
  return () => subscription.remove();
}
