/**
 * Typography tokens for LiAI - enhanced with more styles like PocketPal.
 */

import { TypeScale } from "./types";

export const typeScale: TypeScale = {
  h1: { size: 32, lineHeight: 40, weight: "600" },
  h2: { size: 24, lineHeight: 32, weight: "600" },
  h3: { size: 20, lineHeight: 28, weight: "500" },
  h4: { size: 16, lineHeight: 24, weight: "400" },
  bodyLg: { size: 16, lineHeight: 24, weight: "400" },
  bodyMd: { size: 14, lineHeight: 20, weight: "400" },
  bodySm: { size: 12, lineHeight: 16, weight: "400" },
  caption: { size: 12, lineHeight: 16, weight: "400" },
  title: { size: 14, lineHeight: 20, weight: "600" },
  xs: { size: 11, lineHeight: 16, weight: "400" },
  micro: { size: 10, lineHeight: 14, weight: "400" },
} as const;

export const FONT_FAMILIES = {
  INTER_REGULAR: "Inter_400Regular",
  INTER_MEDIUM: "Inter_500Medium",
  INTER_SEMIBOLD: "Inter_600SemiBold",
  SPACE_GROTESK_REGULAR: "SpaceGrotesk_400Regular",
  SPACE_GROTESK_MEDIUM: "SpaceGrotesk_500Medium",
  SPACE_GROTESK_SEMIBOLD: "SpaceGrotesk_600SemiBold",
  SPACE_GROTESK_BOLD: "SpaceGrotesk_700Bold",
} as const;

