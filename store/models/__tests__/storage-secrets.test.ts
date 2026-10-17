/** The secret writers must REJECT when SecureStore refuses (D3-6).
 *
 * `setHfToken` persists before it flips the store, and
 * `components/settings/hf-token-settings.tsx` keys its inline
 * "Error saving token" state off that rejection. A swallowed failure would
 * report success for a token that is not on disk.
 *
 * Exercised through `createSecrets`, whose injected loader exists for
 * exactly this reason (SecureStore is a dynamic import Jest cannot
 * resolve), so no native module is touched and the calls are exact.
 */

import { createSecrets } from "../storage";

type SecureStore = typeof import("expo-secure-store");

const setItemAsync = jest.fn<Promise<void>, [string, string]>();
const deleteItemAsync = jest.fn<Promise<void>, [string]>();
const getItemAsync = jest.fn<Promise<string | null>, [string]>();

function loader(): Promise<SecureStore> {
  return Promise.resolve({
    setItemAsync,
    deleteItemAsync,
    getItemAsync,
  } as unknown as SecureStore);
}

// The failure paths deliberately still log; keep that noise out of the run.
let warn: jest.SpyInstance;

beforeEach(() => {
  setItemAsync.mockReset();
  deleteItemAsync.mockReset();
  getItemAsync.mockReset();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("writeSecret", () => {
  it("writes through to SecureStore", async () => {
    const { writeSecret } = createSecrets(loader);
    setItemAsync.mockResolvedValue(undefined);

    await writeSecret("k", "v");

    expect(setItemAsync).toHaveBeenCalledWith("k", "v");
  });

  it("REJECTS when SecureStore refuses", async () => {
    const { writeSecret } = createSecrets(loader);
    setItemAsync.mockRejectedValue(new Error("locked out"));

    await expect(writeSecret("k", "v")).rejects.toThrow("locked out");
  });

  it("still logs the failure before rejecting", async () => {
    const { writeSecret } = createSecrets(loader);
    setItemAsync.mockRejectedValue(new Error("locked out"));

    await expect(writeSecret("k", "v")).rejects.toThrow();

    expect(warn).toHaveBeenCalled();
  });
});

describe("deleteSecret", () => {
  it("deletes through to SecureStore", async () => {
    const { deleteSecret } = createSecrets(loader);
    deleteItemAsync.mockResolvedValue(undefined);

    await deleteSecret("k");

    expect(deleteItemAsync).toHaveBeenCalledWith("k");
  });

  it("REJECTS when SecureStore refuses", async () => {
    const { deleteSecret } = createSecrets(loader);
    deleteItemAsync.mockRejectedValue(new Error("locked out"));

    await expect(deleteSecret("k")).rejects.toThrow("locked out");
  });
});

describe("readSecret", () => {
  it("keeps its forgiving contract: a read failure is a missing value", async () => {
    const { readSecret } = createSecrets(loader);
    getItemAsync.mockRejectedValue(new Error("no biometrics"));

    await expect(readSecret("k")).resolves.toBeNull();
  });
});