/** Typed shim for Expo Router's unexported testing-library entry.
 *
 * The runtime file is installed, but TypeScript's resolution for this
 * package does not expose the subpath, so route tests need an explicit
 * module declaration to stay typechecked.
 */

declare module "expo-router/testing-library" {
  import type { ReactElement } from "react";
  import type * as ReactNativeTestingLibrary from "@testing-library/react-native";

  type RenderResult = ReturnType<ReactNativeTestingLibrary.render>;

  export const screen: typeof ReactNativeTestingLibrary.screen;
  export const testRouter: {
    navigate(path: string): void;
    push(path: string): void;
    replace(path: string): void;
    back(path?: string): void;
    canGoBack(): boolean;
    setParams(params: Record<string, string>, path?: string): void;
    dismissAll(): void;
  };
  export type MockContextConfig = Record<string, () => ReactElement>;
  export type RenderRouterOptions = Parameters<
    ReactNativeTestingLibrary.render
  >[1] & {
    initialUrl?: unknown;
    linking?: Record<string, unknown>;
  };
  export type RenderRouterResult = RenderResult & {
    getPathname(): string;
    getPathnameWithParams(): string;
    getSegments(): string[];
    getSearchParams(): Record<string, string | string[]>;
    getRouterState(): unknown;
  };
  export function renderRouter(
    context?: MockContextConfig,
    options?: RenderRouterOptions,
  ): RenderRouterResult;
}