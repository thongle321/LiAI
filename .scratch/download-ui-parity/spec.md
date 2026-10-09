# Download UI parity with PocketPal — behaviour and disclosure

Status: ready-for-agent

Feature slug: `download-ui-parity`

## Problem Statement

LiAI's model-download experience was brought to behavioural parity with the
reference app at the engine level, but the surrounding experience has three
gaps that a user can feel without ever seeing the reference app:

1. **A download can start against a disk that cannot hold it.** Free space is
   read once, when the preset accordion opens, and the result is applied only
   to Hugging Face bookmark cards. Preset cards — the models most people
   actually download — get no disclosure at all. The authoritative check
   happens later, inside the download start path, so the user taps Download,
   waits, and only then learns the disk is full. The reference app instead
   polls storage continuously while a card is on screen, greys out the
   Download button when the model will not fit, and says so inline: *"Storage
   low! Model 4.2 GB > 1.1 GB free"*.
2. **The download notification may never appear.** The Android worker posts a
   foreground-service notification, which the parity audit grades as *better*
   than the reference app. But nothing in the app ever requests the
   `POST_NOTIFICATIONS` runtime permission, so on Android 13 and later the
   notification is silently suppressed. The one surface where LiAI's download
   UX is ahead of the reference is the one surface the user never sees. The
   reference app requests the permission before every download.
3. **The storage failure advice points at a screen that shows nothing.** The
   failure dialog tells the user to *"Check the free space reported in
   Settings"*. Settings contains no free-space figure anywhere. Following the
   instruction leads nowhere.

Alongside those, two smaller things: the progress caption prints byte and
speed figures that disagree by about five percent because they are formatted
against different unit bases, and the progress bar is thinner than the
reference app's.

## Solution

Bring the download experience's *behaviour* to parity with the reference app
while keeping LiAI's own visual language:

- A continuous, in-card storage check that disables the Download button and
  states the shortfall inline, on every surface that offers a Download button.
- The authoritative pre-flight refuses to start when free space is unknown,
  matching the reference app.
- The `POST_NOTIFICATIONS` permission is requested before a download starts,
  so the foreground notification is actually visible.
- Settings gains a storage row, making the existing failure advice true.
- The progress caption's two figures agree.
- The progress bar adopts the reference app's proportions.

Progress *state presentation* is largely unchanged: the caption string, its
type, the card anatomy, and the reset-dialog copy were already at parity.

## User Stories

1. As a user about to download a preset model, I want the Download button to
   be disabled when the model cannot fit on my device, so that I learn it
   before waiting rather than after.
2. As a user about to download a preset model, I want to see how much space
   the model needs and how much I have, so that I can judge whether to free
   some up.
3. As a user whose storage is low, I want the shortfall stated in plain
   language on the card itself, so that I do not have to open another screen
   to find out why Download is greyed out.
4. As a user whose storage recovers mid-session, I want the Download button to
   become available again without me restarting the app, so that I can proceed
   as soon as I have made room.
5. As a user downloading a vision model, I want the projector counted toward
   the space requirement, so that the check reflects the real download.
6. As a user on a device whose free-space reading fails, I want the download
   to be refused rather than started, so that I never fill the disk to
   breaking point and corrupt other data.
7. As a user on a device whose free-space reading fails, I want to be told
   plainly that storage could not be determined, so that the refusal is not
   mysterious.
8. As a user downloading from Hugging Face search, I want the same storage
   check as on preset cards, so that the guarantee is not limited to one
   catalog.
9. As a first-run user picking a model during onboarding, I want the same
   storage check, so that my only download does not fail for a reason the UI
   never mentioned.
10. As a user starting any download, I want the app to ask for notification
    permission, so that I can see download progress without leaving the app.
11. As a user who has already answered the notification prompt, I want to be
    able to decline it and still download, so that the prompt is not a gate.
12. As a user whose downloads fail for lack of space, I want the advice in the
    failure dialog to lead somewhere real, so that I am not sent to a Settings
    screen that shows nothing.
13. As a user checking my device's storage, I want to see how much space is
    free, so that I can tell whether a given model will fit.
14. As a user reading a download caption, I want the byte figure and the speed
    figure to use the same units, so that the line does not contradict itself.
15. As a user watching a long download, I want the progress bar to be clearly
    visible, so that I can read progress at a glance.
16. As a user downloading a model, I want it to become my active model
    automatically when it is the first one I download, so that I can start
    chatting immediately. *(Superseded by story 17 — recorded because it was
    the previous behaviour and its removal is deliberate.)*
17. As a user who has just downloaded my only model, I want the app to make me
    choose to activate it, so that activation is always an explicit act —
    matching the reference app.
18. As a user with a metered connection, I want to pause a download and resume
    it later, so that I am not forced to choose between cancelling and
    overrunning my data allowance.
19. As a user retrying a download that failed near the end, I want to pick up
    from the bytes already on disk, so that I do not re-transfer a
    multi-gigabyte model.
20. As a user, I want downloads to be visible on the models screen without a
    floating banner overlaying other screens, so that nothing covers the
    content I am reading.
21. As a user, I want the download failure dialog to name the cause and give me
    numbered steps to fix it, so that I can resolve it myself.
22. As a user, I want the progress caption to read in the same form as the
    reference app, so that the two apps are not confusingly different.
23. As a user, I want a downloaded model to appear under "Ready to use" with a
    Load control, so that activation is discoverable where I expect it.
24. As a user, I want the reset-models action to tell me my downloaded files
    are kept, so that I do not fear resetting settings.
25. As a user, I want every download surface — preset cards, bookmark cards,
    Hugging Face search, the projector picker, onboarding — to look and behave
    the same way, so that I learn the interaction once.

## Implementation Decisions

- **Storage decision extracted as a pure module.** The rule "does this model
  fit, given this much free space" is a total function over numbers, with no
  I/O. It is extracted from the download start path into a pure module in the
  same shape as the existing learned-ceiling load guard, so the branch logic
  is testable without a device or a filesystem.

- **The storage decision fails closed.** Free space that cannot be read is
  treated as "does not fit". This matches the reference app and is a
  deliberate reversal of our previous policy, which failed open on the
  reasoning that *"unknown free space must never disable a download button"*.
  The reversal is chosen because a download that fails reports its own
  failure honestly, whereas a permanently-disabled button does not.

- **The pre-flight sums the projector for vision models**, so a vision
  model's requirement is the model plus its projector, as in the reference
  app. A required size that is not a positive finite number is treated as
  unfitting.

- **The in-card check is periodic, not one-shot.** A single read at accordion
  open is stale by the time the user decides. The card re-reads on an interval
  while mounted, so the button reflects current conditions and re-enables
  itself once space is freed.

- **Space disclosure covers every surface that offers a Download button**:
  preset cards, Hugging Face bookmark cards, Hugging Face search file rows,
  and the onboarding picker. The ready-models list, the projector picker, and
  the failure dialog have no Download button and are unaffected.

- **No auto-activation on download completion.** A completed download flips
  the model to downloaded and nothing else. The reference app never
  auto-activates either. The cost is explicit and accepted: a first-time user
  who downloads their only model lands on a chat with no model selected, and
  must tap Load. This is recorded as a parity choice, not an oversight.

- **Pause is retained** as a deliberate divergence. The reference app has no
  paused state anywhere; its only alternative to letting a download continue
  is cancelling, which deletes the partial file. On a metered connection,
  pausing a multi-gigabyte download and resuming it later is the capability
  that matters, so the extra state stays.

- **Retry resumes rather than restarting.** The reference app's retry discards
  partial progress and starts from zero. Ours re-stats the disk and continues
  from the bytes already written. Recorded as a conscious divergence.

- **Notification permission is requested before each download start**, in the
  download path rather than at app launch, so the prompt arrives when the
  feature that needs it is being used. Requesting on every download means a
  user who declines may be asked again; this is accepted to match the
  reference app.

- **Settings gains a storage row** reporting free space, which makes the
  existing failure-dialog advice — *"Check the free space reported in
  Settings"* — true. The advice text is unchanged.

- **The progress caption uses one unit base for both figures.** Byte and speed
  figures are formatted against the same base, so a line can no longer read
  with two numbers that disagree. Byte formatting itself stays decimal.

- **The ETA keeps its lack of an hours branch.** A multi-gigabyte model at a
  slow rate renders as a large number of minutes. This is the reference app's
  output and matching output verbatim is the goal.

- **The progress bar adopts the reference app's proportions** — eight pixels
  tall with a five-pixel radius — rendered with LiAI's own colour tokens.

- **One progress idiom across all surfaces.** The reference app draws progress
  on its Hugging Face file card as a gradient wash across the whole card in a
  hardcoded non-token colour. That is not adopted: a single bar everywhere
  reads as consistency rather than as a bug.

- **The job-listing accessor is kept.** An earlier draft of this spec proposed
  deleting it as dead code, on the grounds that no user interface renders it.
  That was wrong, and the correction is recorded here rather than quietly
  dropped. The accessor has eight live call sites: it backs pause, resume and
  cancel, the free-space watcher, and — most importantly — cold-start adoption
  of transfers that outlived the JS runtime. Deleting it would cost the app the
  ability to resume a download after a process death. Its only true defect is
  that no user interface consumes it, which is not the same as nothing calling
  it.

- **No global download overlay, banner, or badge.** Downloads are visible on
  the models screen only. This was decided twice previously and stands.

- **Reference components that their own app never renders are not ported**:
  the download progress card, the file card's progress-bar styles, and the
  iOS background-downloading setting. Their dead code is not a design.

- **The parity audit document gains rows for each conscious divergence** —
  pause retained, retry resumes, no auto-activation, no hours branch — with
  the cost of each stated, so a later reader does not mistake a decision for
  an oversight.

## Testing Decisions

A good test here asserts **external behaviour of a decision**, not the shape of
a component. This codebase has no component test harness — React Native
components cannot be rendered under `node --test` — so anything visual or
native is guarded by source assertion, and anything decidable is extracted
into a pure module and tested directly. That split is the established pattern
in this repo, not a compromise adopted for this feature.

- **One new pure module for the storage decision**, mirroring the existing
  learned-ceiling load guard, which is the direct analogue and sets the
  precedent. Tested as an exhaustive truth table: free space unknown means
  blocked; a required size that is not positive and finite means blocked; an
  exact fit is allowed; one byte short is blocked; a vision model's
  requirement includes its projector; an implausibly large free-space figure
  is allowed.

- **The existing progress formatting module is extended**, not replaced. It is
  already pure and already tested. The new assertion is that byte and speed
  figures in one caption agree — the regression being that they must never
  disagree again.

- **Source assertions for what cannot be reached**, following the existing
  message-list and turn-footer test files: that the notification permission is
  requested from the download path rather than at launch; that the progress
  bar carries the agreed dimensions; that no code path auto-activates a
  downloaded model; that the deleted job-listing accessor stays deleted.

- **No store-level integration test.** The models store imports the filesystem
  and the native download module, so it cannot be imported under `node --test`
  without injecting both. That refactor is larger than the feature it would
  guard, and the repo has never done it. The decisions that matter are
  extracted and tested directly instead; the wiring around them is guarded by
  source assertion.

- **Prior art**: the learned-ceiling load guard test for a "should we proceed"
  predicate; the interrupted-download resume-state test for a decision with no
  native seam; the progress formatting test for pure formatting; the
  message-list and turn-footer tests for source-asserting a component.

## Out of Scope

- **Queue management UI** — pause-all, cancel-all, ordering, per-download
  priority. Neither app has one; the reference app's only aggregate affordance
  is an inert badge.
- **A disk-usage or cleanup screen.** Settings gains a single free-space row,
  not a usage breakdown, a model browser, or a prune action.
- **Checksum verification** of downloaded files.
- **Enumerating the models directory** for orphaned files with no catalog row.
  True of both apps.
- **The endless-retry loop on a genuinely full disk.** Both apps share it; the
  fix is a native pre-flight and a specific error branch that `node --test`
  cannot reach.
- **The gradient progress wash** on Hugging Face file cards.
- **iOS download support.** The native module is Android-only.
- **Download settings** such as wifi-only, parallel counts, or a storage
  location picker. Neither app has them.
- **Any change to the download engine**, worker, or Room store. Those are at
  parity from earlier work.

## Further Notes

- **The fail-closed policy has a blast radius worth stating.** If the free-space
  read throws on some device or OS version, no download can start on that
  device at all, permanently. This is the reference app's behaviour and was
  chosen deliberately, but it is the single most likely line in this spec to
  need revisiting. If it misbehaves, the reversal is a one-line change back to
  failing open.

- **Dropping auto-activation reads, to a user, like a bug** — "I downloaded a
  model and nothing happened." The card does flip to a Downloaded state with a
  Load control, so the information is present, but the contrast with the
  previous behaviour is stark. Restoring it is a small change if it proves
  irritating.

- **Requesting notification permission on every download re-prompts users who
  declined.** That is the reference app's behaviour and was chosen over a
  once-only request.

- **No component test harness exists**, so every claim in this spec about how
  something looks is a claim about pixels. Verification is typecheck, the full
  suite, and a documented manual pass over the affected surfaces.

- **One spec claim was wrong, and is corrected in the decisions above.** The
  claim was that a driver accessor had no callers. The truth was that no user
  interface renders it — a weaker and completely different statement. Eight
  call sites existed, including the one that recovers downloads after the
  process is killed. Worth remembering whenever a report describes a symbol as
  unrendered: unrendered is not uncalled, and the difference is the whole
  review.

- **The parity audit document is the reference for what is already at parity**
  and must be updated in the same change, so the divergences recorded here do
  not contradict the ones already written down.
