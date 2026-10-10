/** LiAI design tokens — TS mirror of `global.css`.
 *
 * Source of truth for styling is `global.css` (`@theme` + `@layer theme`);
 * this file mirrors the same values for JS-only use (icon colors,
 * third-party props, `useCSSVariable` guards). Keep the two in sync.
 * Authority: DESIGN.md. Font is Inter, loaded via expo-font in
 * app/_layout.tsx. Light-locked — the app has exactly one theme.
 */

export const colors = {
  /** The signal, as two steps of ONE hue (never two colours).
   *
   * The board's Signal Blue #3882F6 is 3.69:1 on white: fine as a MARK
   * (icons, borders, focus rings — the 3:1 non-text floor) but illegal as
   * text or under a white label, which need 4.5:1. `primary` is the step
   * that carries anything read; `primaryMark` is the board colour, kept for
   * non-text marks. Collapsing them into one value is what put every
   * `text-primary` site and every primary button below AA. */
  primary: "#2563EB",
  primaryMark: "#3882F6",
  primaryHover: "#1D4ED8",
  primaryPressed: "#1D4ED8",
  onPrimary: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  /** Same split: `errorMark` is the 3.76:1 mark for borders and dots, `error`
   *  the step that carries text and fills (#b91c1c — #dc2626 failed on the
   *  recessed grounds at 4.41 and 4.44). */
  error: "#B91C1C",
  errorMark: "#EF4444",
  /** Coolant cyan — machine-in-the-loop states only. */
  info: "#06B6D4",
  /** Cool Paper: the page. Clean White: raised. Mist: recessed. */
  base: "#F8FAFC",
  surface1: "#FFFFFF",
  surface2: "#F1F5F9",
  /** Surface tint — a ground for selected elements, never a border. */
  surface3: "#EFF6FF",
  border: "#E2E8F0",
  /** Slate: secondary text only. Ink: everything that is read.
   *  One step darker than the board's #64748B, which failed on Mist (4.34)
   *  and Surface Tint (4.37). */
  secondaryText: "#475569",
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
