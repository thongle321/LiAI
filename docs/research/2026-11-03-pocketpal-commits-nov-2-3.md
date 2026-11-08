# PocketPal commits 2026-11-02 → 2026-11-03 — parity verdicts

Source: `pocketpal-ai/` local checkout, `git log --since=2026-11-02 --until=2026-11-04`.

## 1) `07f3728f` — `[Bug]: Unlimited max tokens sends max_completion_tokens -1 to remote servers (#1045)`

**Verdict: SKIP — not applicable.**

PocketPal forwards the sampler set to remote servers and now omits a
non-positive `n_predict` before mapping it to `max_completion_tokens`.
LiAI's remote engine (`services/inference/remote-engine.ts`) never forwards
sampler overrides at all — the recorded divergence in
`2026-10-06-pocketpal-chat-divergence.md`. There is no `max_completion_tokens`
anywhere in the request path. The only `max_tokens` on the remote path is the
`max_tokens: 1` validation probe in `services/models/remote-api.ts:177`,
which is already positive.

## 2) `d67f5a33` — `[Bug]: Voice mode loses its memory sheet right after voice setup (#1048)`

**Verdict: PORTED (sheet-scoped close + full setup-completion gates).**

Root cause: `dismissSheet()` cleared whatever sheet was current, and the shared
`Sheet` fires `onClose` from `onDidDismiss` even when it was dismissed
programmatically. A late close from the setup sheet therefore wiped the memory
sheet that `setupDone()` had just opened.

Ported:
- `dismissSheet(kind?)` now clears only a sheet of that kind
  (`hooks/useVoiceMode.ts`).
- The Voice tab passes `"setup"` / `"memory"` to each sheet's `onClose`
  (`app/(drawer)/(tabs)/voice.tsx`), including the vision-entry cleanup.
- `setupDone()` now mirrors the reference's full completion contract:
  - `setupPending` ignores a voice tap while the completion is in flight, so
    `requestEntry` cannot run the gates a second time.
  - `setupWait` is a monotonic id; only the latest of two overlapping
    completions may act.
  - `chatModelSettled` waits for `appState === "active"` and a settled chat
    context (`activeProviderType === "remote" || activeModelId === null ||
    !isContextLoading`), with `VOICE_START_TIMEOUT_MS` as the ceiling.
  - A timeout warns (`"Taking too long to load — tap the mic to try again."`)
    instead of measuring a half-loaded turn.
  - `focused` (reported by `useVoiceSession`) and `open` gates stop a
    completion that lands after the screen was left or a session opened.
  - The completion calls `checkMemoryAndEnter()` directly, with an
    `isModelReady` guard, instead of re-entering through `requestEntry`.

Adaptation: PocketPal uses mobx `when(..., {timeout})`; LiAI has Zustand and a
controller-owned `appState`, so the wait is a 50 ms `setInterval` poll
(`waitUntil`) that also observes lifecycle changes no store event announces.
`focused` defaults `true` so headless entry and unit tests need no screen;
`appState` defaults `"active"` and the host hook keeps it current. The timeout
message rides `notifyError` because LiAI has no `uiStore.l10n`.

## Files touched

- `hooks/useVoiceMode.ts`
- `app/(drawer)/(tabs)/voice.tsx`
- `hooks/__tests__/useVoiceMode.test.tsx`
- `jest/voice-screen.test.tsx`
