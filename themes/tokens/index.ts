/**
 * Design tokens for LiAI - modular structure.
 */

import { useUniwind } from "uniwind";
import { lightColors, darkColors } from "./colors";
import { typeScale } from "./typography";
import { spacing } from "./spacing";
import { radius } from "./radius";
import { shadow } from "./shadow";

export { lightColors, darkColors } from "./colors";
export { typeScale } from "./typography";
export { spacing } from "./spacing";
export { radius } from "./radius";
export { shadow } from "./shadow";
export type { TypeScale, TypographyStyle, TokenRadius, TokenSpacing, TokenShadow, ShadowStyle } from "./types";

export const font = {
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
} as const;

export const embeddedText = {
  markdownH3: 18,
  code: 13,
} as const;

export type ColorName = keyof typeof lightColors;
export type Colors = Record<ColorName, string>;

export const colors: Colors = lightColors;

export function useColors(): Colors {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

export function useColorScheme(): "light" | "dark" {
  const { theme } = useUniwind();
  return theme === "dark" ? "dark" : "light";
}
