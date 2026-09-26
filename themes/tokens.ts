/** LiAI design tokens — TS mirror of `global.css`.
 *
 * Source of truth for styling is `global.css` (`@theme` + `@layer theme`);
 * this file mirrors the same values for JS-only use (icon colors,
 * third-party props, `useCSSVariable` guards). Keep the two in sync.
 * Authority: DESIGN.md. Font is Inter, loaded via expo-font in
 * app/_layout.tsx. Light-locked — the app has exactly one theme.
 */

export const colors = {
  /** Signal Blue: the system's only voice, one live element per screen. */
  primary: "#3882F6",
  primaryHover: "#2563EB",
  primaryPressed: "#2563EB",
  onPrimary: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  /** Coolant cyan — machine-in-the-loop states only. */
  info: "#06B6D4",
  /** Cool Paper: the page. Clean White: raised. Mist: recessed. */
  base: "#F8FAFC",
  surface1: "#FFFFFF",
  surface2: "#F1F5F9",
  /** Surface tint — a ground for selected elements, never a border. */
  surface3: "#EFF6FF",
  border: "#E2E8F0",
  /** Slate: secondary text only. Ink: everything that is read. */
  secondaryText: "#64748B",
  primaryText: "#0F172A",
  inverseText: "#FFFFFF",
} as const;

export type ColorName = keyof typeof colors;

/** Scrim for modal and sheet backdrops — near-black at 60%, never tinted. */
export const scrim = "rgba(15, 23, 42, 0.6)";

export const font = {
  /** Names must match expo-font loads in app/_layout.tsx (no fallbacks). */
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemiBold: "Inter_600SemiBold",
} as const;

export const typeScale = {
  h1: { size: 32, lineHeight: 40, weight: "600" },
  h2: { size: 24, lineHeight: 32, weight: "600" },
  h3: { size: 20, lineHeight: 28, weight: "500" },
  h4: { size: 16, lineHeight: 24, weight: "400" },
  bodyLg: { size: 16, lineHeight: 24, weight: "400" },
  bodyMd: { size: 14, lineHeight: 20, weight: "400" },
  bodySm: { size: 12, lineHeight: 16, weight: "400" },
  caption: { size: 12, lineHeight: 16, weight: "400" },
} as const;

export const radius = {
  /** Micro 2 · small 4 · default 8 · large 12 · x-large 16. */
  micro: 2,
  small: 4,
  default: 8,
  large: 12,
  xLarge: 16,
  /** Fully circular: only for things you press and things that listen. */
  full: 999,
  /** Semantic alias for the workhorse radius (CSS: --radius-card). */
  card: 8,
} as const;

/** 4px scale — every value here is on it, by rule. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
