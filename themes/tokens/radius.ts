/**
 * Radius tokens for LiAI.
 */

import { TokenRadius } from "./types";

export const radius: TokenRadius = {
  micro: 2,
  small: 4,
  default: 8,
  large: 12,
  xLarge: 16,
  full: 999,
  card: 8,
} as const;
