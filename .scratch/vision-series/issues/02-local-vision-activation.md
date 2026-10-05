# 02: Load the projector and turn local vision on

**Source:** docs/research/2026-10-06-pocketpal-vision-feature.md §5 (gaps A1b, C1).

**What to build:** The turn that makes vision real on-device. The engine loader
already accepts a projector path and has the multimodal-initialisation hook, but the
production load call passes no path, so the hook has never run; and the send path's
image gate is hardcoded to "cannot see", so every image is stripped before it
reaches that hook. This ticket wires the downloaded projector (ticket 01) into the
engine load, replaces the hardcoded gate with an honest runtime capability — "the
loaded context actually has a projector attached" — and lets images flow.

Demo: with a local vision model and its projector downloaded, attach a photo in
chat and the model answers about the photo. With a text-only model, the photo is
dropped and the existing warning appears — and it is now *true*, raised only when
images were genuinely dropped.

**Blocked by:** 01 (needs the projector on disk).

**Status:** done — 0beef8e (+ review pass 6e838a4)

- [ ] Loading a local model that has a downloaded projector initialises
      multimodal support at engine-load time; a model without one loads normally.
- [ ] The hardcoded always-false image gate is replaced by a capability read of
      the loaded context: projector attached ⇒ can see; otherwise cannot.
- [ ] Capability is load-state honest: a vision *file* with no projector loaded
      reports cannot-see (declaration alone never flips it).
- [ ] Chat: image + local vision model ⇒ the model's answer is about the image
      (behaviour test at the turn seam plus an on-device check stated for the PR).
- [ ] Chat: image + text-only model ⇒ text-only turn with the can't-see warning,
      raised exactly when images were dropped and not otherwise.
- [ ] The engine slot key accounts for the projector so attaching/detaching it
      cannot reuse a stale context.
- [ ] Existing text-only turns, retries and regeneration are unaffected.
- [ ] `npm run typecheck` and `npm test` green.
