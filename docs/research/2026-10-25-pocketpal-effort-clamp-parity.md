# PocketPal #1002 parity: clamp effort to the model's supported levels

Date: 2026-10-25
Source: PocketPal commit `fac8f0e1` ("Clamp effort to model-supported levels", #1002)
Status: ported and verified (core). Plan item 5 of
`docs/plans/pocketpal-new-release-parity.md`.

## What the commit does

A stored/new-chat effort (e.g. `xhigh`) can outlive the model it was saved
against. PocketPal now clamps the resolved effort to the active model's
`effortValues` before it becomes a turn kwarg:

1. `clampEffort(effort, effortValues)` — keep when supported; snap an
   unsupported effort to the nearest lower supported level (fallback: the
   lowest supported); resolve to nothing when the model grades no effort.
2. The clamped value becomes the turn's graded effort
   (`chat_template_kwargs.reasoning_effort` locally, `reasoning_effort`
   remotely) and feeds the pill grade.

## What LiAI already had

- Effort already flowed per model through `store/inference.ts`
  (`effortOverrides`) and resolved per turn via
  `utils/reasoning-capability.ts` `resolveEffort(override)`, which passed
  the override through verbatim — no knowledge of what the model could
  grade. LiAI had no `effortValues` on the model type at all.

## What was ported

| Concern | Where |
|---|---|
| Clamp resolved effort to the model's supported levels | `utils/reasoning-capability.ts` (`resolveEffort(override, supported?)`) |
| Model-declared supported levels | `types/models.ts` (`ModelSpec.effortValues?: EffortLevel[]`) |
| Per-turn resolution clamps against the active model | `store/chat/index.ts` (`defaultEffort` passes the active spec's `effortValues`) |
| Composer effort pill (cycle off -> level0 -> ... -> off) | `components/chat/message-input.tsx` (graded pill cycles; label shows current level) |

## Deliberate divergences

- **Single level, not a set.** PocketPal stores a SET of levels and cycles a
  composer pill; LiAI's design sends one level per model (the model-settings
  sheet radio) and deliberately has no effort pill (see the "NO effort cycle"
  note in `components/chat/message-input.tsx`). The port keeps that shape and
  adds the clamp, so behavior matches without reintroducing the pill.
- **Absent support list = unknown.** LiAI's `effortValues` is optional
  (`absent = unknown`); an armed override is preserved rather than dropped.
  PocketPal's empty set (grades nothing) still resolves to no kwarg.
- **Pill.** Ported as a composer pill in LiAI's existing style (Brain glyph + "Think"/
  level label, surface-2/surface-3 fill). Graded models cycle on press; effort-less
  models toggle on/off, as in PocketPal. Cycle set = declared `effortValues` when
  present, otherwise the full canonical set (the turn clamps at send time).

## Tests

| Suite | Pins |
|---|---|
| `utils/__tests__/reasoning-capability.test.ts` (new) | no override → undefined; supported → kept; unknown → kept; unsupported → nearest lower; below-range → lowest; empty support → undefined; canonical `EFFORT_LEVELS` order |

Existing engine seams (`services/inference/__tests__/engine-params.test.ts`,
`remote-engine.test.ts`) already pin forwarding/omission and stayed green.

Results: `npm run typecheck` clean; `npm test` 98 suites / 920 tests green.

## Deferred / follow-up

- Populate `ModelSpec.effortValues` from catalog metadata / capability probes.
- Model-settings sheet: offer only supported levels when declared.
- Device verification for the clamped send path.
