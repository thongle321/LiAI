# 05: Watch mode — continuous capture, answer only on ask

**Source:** docs/research/2026-10-06-pocketpal-vision-feature.md §5 (gap A5),
amended by user decision 2026-10-06: capture continuously, **infer only when the
user asks** — the reference app's auto-send-per-frame loop is rejected, the
capture mechanics are ported.

**What to build:** An opt-in watch mode on the vision screen. While on, a capture
loop keeps a **rolling buffer of the most recent frames** (interval-adjustable
500–5000 ms, capped at the existing per-turn image limit). **No inference ever
runs by itself** — the model is only asked when the user asks, by chat or voice.
When a question comes, the buffered recent frames + the question go out as one
multi-image turn, so the model can answer *temporal* questions ("what just
moved?", "what changed?") — something today's single at-ask snapshot cannot.
With the mode off, the screen behaves exactly as it does today (single snapshot
taken at ask time). The buffer is plain frames on a timer: capture is cheap,
nothing is sent, stored, or answered until the user speaks or types.

**Blocked by:** 02 (needs local vision actually working to send frames to).

**Status:** ready-for-agent

- [ ] Opt-in watch-mode control on the vision screen; off = today's
      snapshot-on-question flow unchanged.
- [ ] While on, frames capture at the chosen interval (500–5000 ms, ± 500 ms
      steps) into a rolling buffer capped at the per-turn image limit; the live
      preview never freezes.
- [ ] **Zero auto-inference:** no completion starts, no answer appears, no TTS
      speaks unless the user asked a question (chat or voice) — pinned by test.
- [ ] On ask: the buffered frames + question send as one multi-image turn and
      the answer comes back through the existing voice/chat path (single frame
      when the buffer holds one, today's at-ask snapshot when the buffer is
      empty).
- [ ] Frames age out of the buffer by interval (oldest dropped), so a stale
      frame can never be the whole answer to "what just happened".
- [ ] Interval persists as a user setting, not on any session or profile record.
- [ ] Stop and screen-exit halt the loop and clear the buffer; no orphaned
      timers, no in-flight generation left running.
- [ ] `npm run typecheck` and `npm test` green.
