/** The chat list's ONE width measurement.
 *
 * PocketPal computes a pixel width once and threads it down
 * (pocketpal-ai ChatView.tsx:836-842): `min(screenWidth * 0.92, 900)`, then
 * spends it in three places — the row's `maxWidth`, the turn wrapper's
 * `width`, and the markdown wrapper's `maxWidth`.
 *
 * Ours could not be a percentage, which is the whole bug. The row was
 * `self-start` + `max-w-[75%]`, and `self-start` makes Yoga shrink-wrap it
 * to its content's INTRINSIC width. A native <Text> reports its full
 * unwrapped width as intrinsic, so the cap limited a row that had already
 * been laid out too wide and the tail of every line was clipped by the
 * list viewport rather than wrapped. Only a definite width fixes that.
 */

/** Assistant prose: unboxed, so it takes the width. User bubble: a
 *  filled shape, so it keeps a cap. PocketPal spends one value on both;
 *  we do not, because after the port only one of ours is a bubble. */
export interface MessageWidths {
  assistant: number;
  user: number;
}

const ASSISTANT_SHARE = 0.92;
const USER_SHARE = 0.8;
/** PocketPal's cap, so a tablet does not get a 9000px line of text. */
const MAX_WIDTH = 900;
/** The list's own `contentContainerClassName="p-5"`, 20 a side. */
const LIST_PADDING = 40;

export function messageWidths(windowWidth: number): MessageWidths {
  // Floor at 0: a negative maxWidth is read as "no constraint" by Yoga,
  // which would bring the clipping straight back on a degenerate width.
  const available = Math.max(0, windowWidth - LIST_PADDING);
  // Share FIRST, cap second — the order PocketPal uses
  // (`Math.min(size.width * 0.92, 900)`). Capping the available width
  // instead would land the assistant at 828, never reaching the 900 the
  // cap exists to allow.
  return {
    assistant: Math.min(Math.floor(available * ASSISTANT_SHARE), MAX_WIDTH),
    user: Math.min(Math.floor(available * USER_SHARE), MAX_WIDTH),
  };
}
