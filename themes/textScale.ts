import { typeScale } from "./tokens.ts";

/** DESIGN.md, Fluid Type: the scale is authored at a 375dp base and
 * rendered sizes may drift by a moderate width factor, clamped so a
 * tablet or a small phone never leaves the band the design was
 * checked in. Returns a multiplier; tokens/tests keep base values. */
export function textScaleFactor(width: number): number {
  const factor = 1 + (width / 375 - 1) * 0.5;
  return Math.min(1.1, Math.max(0.9, factor));
}

/** camelCase typeScale key → global.css --text- name (bodyLg → body-lg). */
function cssVarName(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** The `--text-*` overrides for a device width: every type token and
 * its line-height companion, scaled and rounded to whole px. Values
 * are unitless numbers — Uniwind's var getters pass numbers straight
 * to RN styles, while a "31px" string reaches the native setter and
 * crashes (RCTText rejects it). This is what ScopedVariables applies
 * at the root so `text-*` classes re-resolve — zero call sites. */
export function fluidTextVariables(width: number): Record<string, number> {
  const factor = textScaleFactor(width);
  const vars: Record<string, number> = {};
  for (const [key, token] of Object.entries(typeScale)) {
    const name = `--text-${cssVarName(key)}`;
    vars[name] = Math.round(token.size * factor);
    vars[`${name}--line-height`] = Math.round(token.lineHeight * factor);
  }
  return vars;
}
