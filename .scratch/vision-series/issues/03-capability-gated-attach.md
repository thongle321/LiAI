# 03: Gate the attach affordance on capability

**Source:** docs/research/2026-10-06-pocketpal-vision-feature.md §5 (gap A2).

**What to build:** PocketPal's attach shape: the attach control is always visible,
but its enabled state follows the capability seam — the active model cannot see ⇒
attach is disabled with a can't-see hint, rather than today's accept-then-strip,
where the picker lets you choose photos the pipeline will discard. Switching
between a vision-capable and a text-only model flips the affordance live, with no
page reload. There is no remaining path where a user can attach an image that the
send path will silently drop: either the control is enabled and the image ships, or
the control is disabled and explains why.

**Blocked by:** 02 (needs the real runtime capability flag).

**Status:** ready-for-agent

- [ ] Attach is always rendered; disabled-with-hint while the active model
      cannot see images, enabled otherwise.
- [ ] Switching models flips the state live (vision ⇒ enabled, text-only ⇒
      disabled, and back).
- [ ] No send path can carry images into a turn that would discard them — the
      disable is at the affordance, not a strip after the fact.
- [ ] The disabled hint uses the established can't-see wording (no new copy
      dialect).
- [ ] Vision screen entry reflects the same seam (it warns per ticket 01, never
      contradicts the composer).
- [ ] `npm run typecheck` and `npm test` green.
