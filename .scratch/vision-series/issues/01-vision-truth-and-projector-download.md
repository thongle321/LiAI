# 01: Vision tab tells the truth, and the download fetches the projector

**Source:** docs/research/2026-10-06-pocketpal-vision-feature.md §5 (gaps C2, C5, A4, A1a).

**What to build:** Two honesty fixes that both stand alone and both start immediately.
First, the vision screen never lies: asking it "what am I looking at?" while the
active model cannot see images shows an explicit "This model can't see images, so
it was sent the text only" style notice **on the vision screen itself** — today the
message only ever reaches the chat screen, so the vision tab answers blind in
silence. The notice reads the same capability seam the send path strips through, so
when ticket 02 makes vision real the notice disappears with no rework. The vision
screen's header comment is rewritten to describe what the screen actually does
(snapshot-on-question via the chat pipeline); it currently documents a frame-stream
interval, a worklet heartbeat, and a vision socket that do not exist in the code.

Second, the models card promises a vision model's real footprint — "LLM +
projector" — but the projector is filtered out of the file list and nothing ever
downloads it. Downloading a vision model now also fetches its paired projector file
(family-prefix pairing; the smallest-projector fallback), so the promise on the card
is the thing that lands on disk.

**Blocked by:** None (can start immediately).

**Status:** done — 06cce3b (+ review pass 6e838a4)

- [ ] Asking the vision screen a question while the model cannot see shows the
      can't-see notice on the vision screen (not only in chat), and never
      silently answers blind.
- [ ] When the capability seam reports images are actually sent, the notice does
      not appear (seam-driven, so ticket 02 flips it for free).
- [ ] The vision screen header describes the real snapshot-on-question behaviour;
      no claim of a frame stream, worklet heartbeat, or vision socket remains.
- [ ] Vision answers **only** when the user asks (chat or voice) — never
      auto-analyses frames (recorded product decision; the reference app's
      auto-send loop is explicitly rejected).
- [ ] Downloading a vision model whose repo carries a paired projector downloads
      the projector too, with pairing verified by test (family match, smallest
      fallback, no-inflation case).
- [ ] A vision model with no projector in its repo still downloads normally and
      is not mislabelled as a completed vision pair.
- [ ] `npm run typecheck` and `npm test` green.
