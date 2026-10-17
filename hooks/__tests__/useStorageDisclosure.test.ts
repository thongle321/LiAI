/**
 * The download cards read this hook, so it owns two things: the I/O interval
 * and the wording. Only the wiring is tested here — the wording rule and the
 * free-space rule are tested as pure functions. What must not regress is a
 * "Download" button that stays disabled with no reason, or stays enabled when
 * the file cannot fit.
 */

import { renderHook, waitFor } from "@testing-library/react-native";

import { useStorageDisclosure } from "../useStorageDisclosure.ts";

let mockFreeSpace: number | null = 1 * 1024 * 1024 * 1024;
let mockThrows = false;

jest.mock("expo-file-system", () => ({
  Paths: {
    get availableDiskSpace() {
      if (mockThrows) throw new Error("no fs");
      return mockFreeSpace as number;
    },
  },
}));

const GB = 1024 * 1024 * 1024;

afterEach(() => {
  mockFreeSpace = 1 * GB;
  mockThrows = false;
});

describe("useStorageDisclosure", () => {
  it("checks nothing for a model with no Download button", () => {
    const { result } = renderHook(() => useStorageDisclosure(null));
    expect(result.current).toEqual({ fits: true, message: null });
  });

  it("allows a model that fits, with no reason line", async () => {
    mockFreeSpace = 10 * GB;
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current).toEqual({ fits: true, message: null });
    });
  });

  it("blocks and explains when the model cannot fit", async () => {
    mockFreeSpace = 512 * 1024 * 1024;
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current.fits).toBe(false);
      expect(result.current.message).not.toBeNull();
    });
    expect(result.current.message).toContain("Storage low!");
  });

  it("blocks when free space cannot be read, because unknown is not a yes", async () => {
    mockThrows = true;
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current.fits).toBe(false);
      expect(result.current.message).not.toBeNull();
    });
    expect(result.current.message).toContain("Couldn't read storage");
  });
});
