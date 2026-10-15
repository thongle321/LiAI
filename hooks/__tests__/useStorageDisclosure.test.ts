/**
 * The download cards read this hook, so it owns two things: the I/O interval
 * and the wording. Only the wiring is tested here — the wording rule and the
 * free-space rule are tested as pure functions. What must not regress is a
 * "Download" button that stays disabled with no reason, or stays enabled when
 * the file cannot fit.
 */

import { renderHook, waitFor } from "@testing-library/react-native";

import { useStorageDisclosure } from "../useStorageDisclosure.ts";

jest.mock("expo-file-system/legacy", () => ({
  getFreeDiskStorageAsync: jest.fn(),
}));

const { getFreeDiskStorageAsync } = jest.requireMock(
  "expo-file-system/legacy",
) as {
  getFreeDiskStorageAsync: jest.MockedFunction<() => Promise<number>>;
};

const GB = 1024 * 1024 * 1024;

afterEach(() => {
  getFreeDiskStorageAsync.mockReset();
});

describe("useStorageDisclosure", () => {
  it("checks nothing for a model with no Download button", () => {
    getFreeDiskStorageAsync.mockResolvedValue(1 * GB);
    const { result } = renderHook(() => useStorageDisclosure(null));
    expect(result.current).toEqual({ fits: true, message: null });
    expect(getFreeDiskStorageAsync).not.toHaveBeenCalled();
  });

  it("allows a model that fits, with no reason line", async () => {
    getFreeDiskStorageAsync.mockResolvedValue(10 * GB);
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current).toEqual({ fits: true, message: null });
    });
  });

  it("blocks and explains when the model cannot fit", async () => {
    getFreeDiskStorageAsync.mockResolvedValue(512 * 1024 * 1024);
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current.fits).toBe(false);
      expect(result.current.message).not.toBeNull();
    });
    expect(result.current.message).toContain("Storage low!");
  });

  it("blocks when free space cannot be read, because unknown is not a yes", async () => {
    getFreeDiskStorageAsync.mockRejectedValue(new Error("no fs"));
    const { result } = renderHook(() => useStorageDisclosure(1 * GB));
    await waitFor(() => {
      expect(result.current.fits).toBe(false);
      expect(result.current.message).not.toBeNull();
    });
    expect(result.current.message).toContain("Couldn't read storage");
  });
});
