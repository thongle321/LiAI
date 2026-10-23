/** Interrupted-download resume state, driven through the pure classifiers.
 *
 * These are the same helpers the native worker's `.part` staging feeds
 * (ticket 05): in-flight bytes live at `<file>.part`, so every resume read
 * must classify the PART's size with the same rules a whole file gets. A
 * part is always a resumable partial — it can never be "complete" (the
 * native commit renames it into place the moment its size is exact), and it
 * must never hand a resume token to a wrong-length file.
 */

import { classifyFileOnDisk, resumeDataForPartial } from "../resume-state";

describe("resumeDataForPartial", () => {
  it("returns the resume offset for a strictly smaller partial", () => {
    expect(resumeDataForPartial(400, 1_000)).toBe("400");
    expect(resumeDataForPartial(999, 1_000)).toBe("999");
  });

  it("refuses the non-resumable edges", () => {
    // Zero bytes: there is nothing to continue.
    expect(resumeDataForPartial(0, 1_000)).toBeNull();
    // Equal-or-over: a part at the full size is not a resume, it is a
    // commit — and an oversized file is corrupt by definition.
    expect(resumeDataForPartial(1_000, 1_000)).toBeNull();
    expect(resumeDataForPartial(2_000, 1_000)).toBeNull();
    // Stat output we cannot trust is not a resume basis.
    expect(resumeDataForPartial(Number.NaN, 1_000)).toBeNull();
    expect(resumeDataForPartial(400, Number.NaN)).toBeNull();
    expect(resumeDataForPartial(400, 0)).toBeNull();
  });
});

describe("classifyFileOnDisk", () => {
  it(".part sizes classify as resumable partials, never complete", () => {
    // The mapper test for .part awareness: a part's byte count enters the
    // SAME classifier a final file's would, and comes out resumable at
    // every sub-total size.
    expect(classifyFileOnDisk(1, 1_000)).toBe("partial");
    expect(classifyFileOnDisk(400, 1_000)).toBe("partial");
    expect(classifyFileOnDisk(999, 1_000)).toBe("partial");
  });

  it("a final file at exactly the catalog size is complete", () => {
    expect(classifyFileOnDisk(1_000, 1_000)).toBe("complete");
  });

  it("overshoot is corrupt regardless of the path it was found at", () => {
    expect(classifyFileOnDisk(2_000, 1_000)).toBe("corrupt");
  });

  it("zero-byte and unjudgeable inputs stay out of the way", () => {
    expect(classifyFileOnDisk(0, 1_000)).toBe("absent");
    expect(classifyFileOnDisk(400, 0)).toBe("unknown");
    expect(classifyFileOnDisk(Number.NaN, 1_000)).toBe("unknown");
  });
});
