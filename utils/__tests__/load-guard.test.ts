/** exceedsLearnedCeiling — the ONE learned-ceiling rule the load guard's
 *  confirm and the HF file row's memory chip both sit on. 1.5x headroom:
 *  the device has demonstrated appetite up to the largest successful
 *  download; a file must exceed that by the margin to be worth warning
 *  about. Nothing learned yet is silence, not a warning.
 */

import { exceedsLearnedCeiling, GUARD_MARGIN } from "../load-guard.ts";

const GIB = 1024 * 1024 * 1024;

describe("exceedsLearnedCeiling", () => {
  it("nothing learned yet is silence", () => {
    expect(exceedsLearnedCeiling(50 * GIB, 0)).toBe(false);
  });

  it("a file at the learned ceiling is not beyond it", () => {
    expect(exceedsLearnedCeiling(GIB, GIB)).toBe(false);
  });

  it("a file inside the 1.5x headroom is not beyond it", () => {
    expect(exceedsLearnedCeiling(1.2 * GIB, GIB)).toBe(false);
  });

  it("beyond the headroom is beyond the ceiling", () => {
    expect(exceedsLearnedCeiling(GIB * (1 + GUARD_MARGIN) + 1, GIB)).toBe(true);
  });
});
