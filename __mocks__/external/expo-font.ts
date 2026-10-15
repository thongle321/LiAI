/** Jest mock for `expo-font` (app/_layout.tsx loads the bundled Inter faces).
 *
 * There is no font engine under Jest, so every font is reported as already
 * loaded: a screen that gates rendering on `useFonts()` must render its
 * children rather than a loading state it would never leave.
 */

export const loadAsync = jest.fn(
  async (_fonts: Record<string, unknown> | string[]): Promise<void> => {},
);
export const isLoading = jest.fn((): boolean => false);
export const isLoaded = jest.fn((): boolean => true);
export const unloadAllAsync = jest.fn(async (): Promise<void> => {});

/** `useFonts` reports loaded immediately and never throws. */
export const useFonts = jest.fn(
  (_fonts?: Record<string, unknown> | string[]): [boolean, Error | null] => [
    true,
    null,
  ],
);

export default {
  loadAsync,
  isLoading,
  isLoaded,
  unloadAllAsync,
  useFonts,
};
