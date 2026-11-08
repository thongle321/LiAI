/** Jest mock for `expo-linking` (QR-scan remote server URL, OAuth-style deep
 * links, `expo-constants`-driven URL building).
 *
 * Under Jest there is no OS to hand a URL to, so every call records and
 * resolves to "not handled". `getInitialURL` resolving to null is the
 * cold-start-without-link case every screen has to survive.
 */

export const createURL = jest.fn((path?: string): string => `liai://${path ?? ""}`);

export const parse = jest.fn((url: string) => ({
  scheme: "liai",
  hostname: "",
  path: "",
  queryParams: {},
  // The real parser throws on a malformed URL; tests that need that use
  // jest.mocked(parse).mockImplementationOnce.
  ...(url ? {} : {}),
}));

export const openURL = jest.fn(async (): Promise<boolean> => false);
export const canOpenURL = jest.fn(async (): Promise<boolean> => false);
export const getInitialURL = jest.fn(async (): Promise<string | null> => null);
export const addEventListener = jest.fn(() => ({ remove: jest.fn() }));
export const removeEventListener = jest.fn(() => {});
export const sendIntent = jest.fn(() => {});
export const getLinkingURL = jest.fn((): string => "exp://127.0.0.1:8081");
export const unwrapDevLaunchURL = jest.fn((url: string): string => url);
/** OS Settings deep link (App-Prefs), used by the mic-blocked issue line. */
export const openSettings = jest.fn(async (): Promise<void> => {});

export default {
  createURL,
  parse,
  openURL,
  canOpenURL,
  getInitialURL,
  addEventListener,
  removeEventListener,
  sendIntent,
  getLinkingURL,
  openSettings,
  unwrapDevLaunchURL,
};




