/** Contrast pick for colored letter avatars (PocketPal's colorUtils
 *  getContrastColor).
 *
 *  A companion's `color[0]` paints the card's avatar block; the centered
 *  letter must read on it whatever color the user picked. The reference
 *  answers black on a light ground, white otherwise, from simple
 *  relative-luminance weights — good enough for a text/no-text decision
 *  (see pocketpal-ai/src/utils/colorUtils.ts).
 */

export function getContrastColor(backgroundColor: string | undefined): string {
  const rgb = parseRgb(backgroundColor);
  if (rgb === null) return "#FFFFFF"; // Reference default for unknown input.
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/** Grab the 8-bit channels out of `#rrggbb` — the only hex shape companion
 *  colors carry — or `rgb(a)(r, g, b, …)`. Null when neither shape parses,
 *  and the caller falls back to a white letter like the reference. */
function parseRgb(color: string | undefined): [number, number, number] | null {
  if (typeof color !== "string") return null;
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return [r, g, b].every(Number.isFinite) ? [r, g, b] : null;
  }
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
