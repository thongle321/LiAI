/** Tablet content-column cap (DESIGN.md Responsive behaviour).
 *
 * The app is adaptive with `supportsTablet: true`, so a full-bleed column
 * stretches to ~600pt on a tablet. DESIGN.md requires capping the column at
 * a reading measure and centring it instead of letting cards span the full
 * width. Pure logic only — no JSX, so the test runs in node.
 */

/** Comfortable reading measure for a list/form column. On the 4px grid. */
export const CONTENT_MAX_WIDTH = 640;

/** Column width for a viewport: the viewport on a phone, the cap on a tablet. */
export function contentColumnWidth(windowWidth: number): number {
  if (windowWidth <= 0) return 0;
  return Math.min(windowWidth, CONTENT_MAX_WIDTH);
}
