/** LiAI design tokens — TS mirror of `global.css`.
 *
 * Source of truth for styling is `global.css` (`@theme` + `@layer theme`
 * with `@variant light` / `@variant dark`); this file mirrors the same
 * values for JS-only use (icon colors, third-party props, inline styles).
 * Keep the two in sync. Authority: DESIGN.md. Font is Inter, loaded via
 * expo-font in app/_layout.tsx.
 *
 * TWO THEMES. `global.css` defines every --color-* token twice (light and
 * dark, prompt_material/dark_mode_design_system.png). React components that
 * read colors at render time must use `useColors()`, which re-resolves on
 * theme switch. The exported `colors` object is the LIGHT palette snapshot
 * — valid at module scope (constants, non-React consumers) but stale the
 * moment the user switches to dark; prefer the hook inside components.
 */

import { useUniwind } from "uniwind";

/** The signal, as two steps of ONE hue (never two colours).
 *
 * The board's Signal Blue #3882F6 is 3.69:1 on white: fine as a MARK
 * (icons, borders, focus rings — the 3:1 non-text floor) but illegal as
 * text or under a white label, which need 4.5:1. `primary` is the step
 * that carries anything read; `primaryMark` is the mark colour, kept for
 * non-text marks. Collapsing them into one value is what put every
 * `text-primary` site and every primary button below AA. */
export const lightColors = {
  primary: "#2563EB",
  primaryMark: "#3882F6",
  primaryHover: "#1D4ED8",
  primaryPressed: "#1D4ED8",
  onPrimary: "#FFFFFF",
  success: "#10B981",
  successFill: "#ECFDF5",
  successMark: "#059669",
  successDeep: "#047857",
  warning: "#92400E",
  error: "#B91C1C",
  errorMark: "#EF4444",
  info: "#06B6D4",
  warmSurface: "#FFEDD5",
  warmAccent: "#C2410C",
  /** Scrim for modal/sheet backdrops — the slate near-black, 60%. */
  scrim: "rgba(15, 23, 42, 0.6)",
  /** Cool Paper: the page. Clean White: raised. Mist: recessed. */
  base: "#F8FAFC",
  surface1: "#FFFFFF",
  surface2: "#F1F5F9",
  surface3: "#EFF6FF",
  border: "#E2E8F0",
  secondaryText: "#475569",
  secondaryTextMuted: "#5F6B7C",
  primaryText: "#0F172A",
  inverseText: "#FFFFFF",
} as const;

/** Dark board (prompt_material/dark_mode_design_system.png). Same roles,
 * dark grounds: Background #0B0C10 is the page, Surface 1 #1E1E24 raised,
 * Surface 2 #23252C recessed, and the selected-element tint ground is
 * the board's Backdrop #1A1D24 (the board's Primary Soft #2A3A56 drops
 * the signal below 4.5:1 on it; Backdrop keeps every text role clear).
 * The signal takes the board's #588CFF step; on-primary is the board's
 * own On Primary #FFFFFF (3.18:1 on the fill — board-sanctioned, pinned
 * in jest/design-system.test.ts); error-as-text keeps the lighter
 * #F87171 step per the Two-Step Rule. */
export const darkColors = {
  primary: "#588CFF",
  primaryMark: "#588CFF",
  primaryHover: "#4E7FF0",
  primaryPressed: "#3F6FE0",
  onPrimary: "#FFFFFF",
  success: "#22C55E",
  successFill: "#22C55E1A",
  successMark: "#22C55E",
  successDeep: "#22C55E",
  warning: "#F59E0B",
  /* Same two-step shape as the light reds, inverted for a dark ground:
     #EF4444 measures only ~4.3:1 on Surface 1 (#1E1E24) — fine as a mark
     (errorMark, 3:1 floor) but under the 4.5:1 text floor. `error` is the
     lighter step that carries text/fills and clears 4.5:1 on every dark
     surface. Mirrors how light keeps #b91c1c (text) vs #ef4444 (mark). */
  error: "#F87171",
  errorMark: "#EF4444",
  info: "#00D1B2",
  warmSurface: "#40301F",
  warmAccent: "#FB923C",
  /** Scrim — the board's Overlay #00000080 (~50% black). */
  scrim: "rgba(0, 0, 0, 0.5)",
  base: "#0B0C10",
  surface1: "#1E1E24",
  surface2: "#23252C",
  surface3: "#1A1D24",
  border: "#2A2E35",
  secondaryText: "#CBD5E1",
  secondaryTextMuted: "#94A3B8",
  primaryText: "#F8FAFC",
  inverseText: "#0B0C10",
} as const;

export type ColorName = keyof typeof lightColors;
export type Colors = Record<ColorName, string>;

/** Light snapshot — module-scope and non-React consumers only.
 *  Components use `useColors()`. */
export const colors: Colors = lightColors;

/** The active palette for the current Uniwind theme; re-renders on switch. */
export function useColors(): Colors {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkColors : lightColors;
}

/** The active scheme as a native `colorScheme` string ("light" | "dark").
 *  One source for the ~8 places that feed a native `colorScheme=` prop or
 *  branch a glyph on the theme — they used to each retype the ternary. */
export function useColorScheme(): "light" | "dark" {
  const { theme } = useUniwind();
  return theme === "dark" ? "dark" : "light";
}

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
  /** Screen titles — pocketpal titleSmall (font-size-comparison.md). */
  title: { size: 14, lineHeight: 20, weight: "600" },
  /** Labels and descriptions — pocketpal labelSmall. */
  xs: { size: 11, lineHeight: 16, weight: "400" },
  /** Assistant footer meta — pocketpal's timing text. */
  micro: { size: 10, lineHeight: 14, weight: "400" },
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

/** Type sizes on THIRD-PARTY surfaces that have no Uniwind rung of their
 * own: the markdown renderer's bubble scale (the parts `typeScale` cannot
 * express) and inline/block code. Pinned by tests/font-scale.test.ts —
 * one home so the chat scale cannot drift into two copies (Part 2 audit,
 * P3). */
export const embeddedText = {
  /** Markdown h3 — the bubble scale's one size between title 20 and body 16. */
  markdownH3: 18,
  /** Inline (codespan) and block code. */
  code: 13,
} as const;
