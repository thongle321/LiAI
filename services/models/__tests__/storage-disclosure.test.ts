import { storageDisclosure } from "../storage-disclosure";

describe("storageDisclosure", () => {
  it("fits with no message", () => {
    expect(storageDisclosure({ modelBytes: 100, freeBytes: 1000 })).toEqual({
      fits: true,
      message: null,
    });
  });
  it("low storage message", () => {
    const out = storageDisclosure({ modelBytes: 500, freeBytes: 100 });
    expect(out.fits).toBe(false);
    expect(out.message).toContain("Storage low!");
  });
  it("unchecked yields no message", () => {
    expect(
      storageDisclosure({ modelBytes: 500, freeBytes: 100, checked: false }),
    ).toEqual({ fits: false, message: null });
  });
  it("unreadable free blocks", () => {
    expect(storageDisclosure({ modelBytes: 500, freeBytes: null })).toEqual({
      fits: false,
      message: "Couldn't read storage — download needs a free-space check",
    });
  });
});
