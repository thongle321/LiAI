/** getContrastColor holds the reference's exact answers for the inputs the
 *  card feeds it (hex `color[0]` values) and degrades to white like the
 *  reference when the input does not parse.
 */

import { getContrastColor } from "../contrast.ts";

describe("getContrastColor", () => {
  it.each([
    ["#000000", "#FFFFFF"], // near-black ground → white letter
    ["#0E0D0C", "#FFFFFF"], // Pip's seeded primary
    ["#2563EB", "#FFFFFF"], // brand blue
    ["#9D174D", "#FFFFFF"], // deep crimson (Lookie-style deck)
    ["#FFFFFF", "#000000"], // white ground → black letter
    ["#FAFAFA", "#000000"], // Pip's seeded secondary
    ["#F1F5F9", "#000000"], // pale slate
    ["#808080", "#000000"], // mid grey just clears the 0.5 luminance line
    ["#7F7F7F", "#FFFFFF"], // one step under it flips to white
  ])("reads %s ground as a %s letter", (ground, expected) => {
    expect(getContrastColor(ground)).toBe(expected);
  });

  it("falls back to white for unknown input, like the reference", () => {
    expect(getContrastColor(undefined)).toBe("#FFFFFF");
    expect(getContrastColor("nope")).toBe("#FFFFFF");
    expect(getContrastColor("#GGIIJJ")).toBe("#FFFFFF");
  });

  it("accepts rgb()/rgba() strings", () => {
    expect(getContrastColor("rgba(14, 13, 12, 1)")).toBe("#FFFFFF");
    expect(getContrastColor("rgb(250, 250, 250)")).toBe("#000000");
  });
});
