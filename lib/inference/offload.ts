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

/** Subscribe; returns an unsubscribe. Only `background` releases — an
 *  `inactive` blip (a phone call, the app switcher) must not cost a
 *  reload. */
export function watchBackgroundRelease(
  source: AppStateLike,
  opts: { isEnabled: () => boolean; release: () => void },
): () => void {
  const subscription = source.addEventListener("change", (status) => {
    if (status === "background" && opts.isEnabled()) opts.release();
  });
  return () => subscription.remove();
}
