# 04: Remote vision

**Source:** docs/research/2026-10-06-pocketpal-vision-feature.md §5 (gaps A3, C4).

**What to build:** Vision on remote providers. The `/props` capability probe
already discovers and stores a remote model's vision support — today it is a dead
field with no consumer — and the remote engine sends text only. This ticket gives
the probe its consumer: when the active remote provider's probed model reports
vision, an attached image is sent as a proper OpenAI-style content array
(`text` + `image_url` entries) and the server's answer is about the image; when the
probe says no, or is absent, attach is disabled for that provider and nothing is
sent. The gate from ticket 03 extends to remote with no new UI — the same seam,
a second source of truth.

**Blocked by:** 03 (extends the same attach gate).

**Status:** ready-for-agent

- [ ] Remote provider whose probe reports vision + attached image ⇒ the request
      carries the image (content array) and the reply answers about it — unit
      test on the remote request builder, on-device check against a vision
      server stated for the PR.
- [ ] Probe reports no vision, or no probe result ⇒ attach disabled for that
      provider; a text-only request goes out unchanged.
- [ ] Per-provider: switching from a vision remote model to a text-only one (or
      to local, or back) flips the affordance live.
- [ ] The probed capability field has a real consumer (its recorded "no consumer
      yet" note is retired).
- [ ] Local behaviour from tickets 02–03 is untouched.
- [ ] `npm run typecheck` and `npm test` green.
