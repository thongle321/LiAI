/** LiAI design tokens — TS mirror of `global.css`.
 *
 * Source of truth for styling is `global.css` (`@theme` + `@layer theme`);
 * this file mirrors the same values for JS-only use (chart configs,
 * third-party props, `useCSSVariable` guards). Keep the two in sync.
 * Font is system-ui until expo-font + Raleway is approved (see AGENTS.md
 * dependency policy); then swap `font.sans` to 'Raleway' + load in _layout.
 */

export const colors = {
  primary: "#DCE87D",
  primaryHover: "#B7D866",
  primaryPressed: "#A7AF4A",
  onPrimary: "#0B0C0C",
  success: "#22C55E",
  warning: "#F6C945",
  error: "#EF4444",
  info: "#3B82F6",
  base: "#0B0C0C",
  surface1: "#141515",
  surface2: "#202122",
  surface3: "#2A2A2E",
  border: "#3F3F46",
  secondaryText: "#A1A1AA",
  primaryText: "#E5E7EB",
  inverseText: "#F7F7F8",
} as const;

export type ColorName = keyof typeof colors;

export const font = {
  /** Names must match expo-font loads in app/_layout.tsx (no fallbacks). */
  sans: "Raleway_400Regular",
  sansMedium: "Raleway_500Medium",
  sansSemiBold: "Raleway_600SemiBold",
} as const;

export const typeScale = {
  h1: { size: 32, lineHeight: 40, weight: "600" },
  h2: { size: 24, lineHeight: 32, weight: "600" },
  h3: { size: 18, lineHeight: 26, weight: "500" },
  h4: { size: 16, lineHeight: 24, weight: "500" },
  bodyLg: { size: 16, lineHeight: 24, weight: "400" },
  bodyMd: { size: 14, lineHeight: 20, weight: "400" },
  bodySm: { size: 12, lineHeight: 16, weight: "400" },
  caption: { size: 11, lineHeight: 14, weight: "400" },
} as const;

export const radius = {
  btn: 12,
  card: 16,
  input: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
