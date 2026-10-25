# LiAI Storage Persistence Integrity

Status: ready-for-agent

## Problem Statement

LiAI is a single-user, on-device app: the phone is the only server, and the
model catalog, the user's model selection, the per-model settings, the remote
API providers and every other preference live in AsyncStorage (with
provider keys in SecureStore). Nothing is backed up anywhere.

The models store was recently migrated to Zustand's `persist` middleware, but
the hand-rolled writers that existed before the migration were left in place.
The result is that **two different code paths write the same storage key in two
different shapes**, and the older path wins:

- The persist middleware writes `{ state, version }` to `liai_models`.
- The catalog slice's `saveModels()` writes a **bare JSON array** to that same
  `liai_models` key, and it runs *after* every catalog mutation - bookmarking a
  model, removing one, importing one, toggling vision, setting a projector,
  clearing an error, and every download-progress tick.

Because the array write happens last, `liai_models` is left holding a bare
array on disk. On the next cold start the store's legacy-migration routine sees
"this key is not a `{ state }` blob", concludes it is an old install, and
rebuilds the whole state from ten separate legacy keys - **which the previous
migration had already deleted**. Everything the user configured therefore comes
back as a default: no active model, empty model settings, no remote providers,
no remote capability cache, privacy acknowledgement cleared, the "attach my
HuggingFace token" preference silently flipped back on, the tool-compatibility
notice re-armed, and the projector-cleanup queue dropped. Only the downloaded
model files themselves survive.

The same class of problem shows up in the store's shadow writers: eight
per-field writers still write their own legacy keys on change, which is how
the values were being kept alive for a migration that had already thrown them
away.

The blast radius is not theoretical. Every user interaction with the model
catalog - and every download - ends with a write that puts the store into the
one shape the migration misreads. Whether the user notices depends entirely on
what the last write before the app was backgrounded happened to be.

Alongside this, the audit that produced this spec found the repository is not
self-sufficient: the test script the test command depends on is untracked, the
documentation folder is untracked, the vendored reference app is untracked, and
the committed Android project is out of sync with the config plugins that
generate it. A fresh clone cannot run the test suite.

## Solution

Give every persisted field exactly one writer, and give the models store one
recognizable on-disk shape.

Concretely: the persist middleware becomes the single owner of the model
store's persisted state. Every hand-rolled writer that wrote a storage key is
reduced to a plain in-memory state update, or removed when it has no other
job. The legacy-migration routine keeps its ability to carry an old install
forward, but it becomes a one-time, defensive reader: it recognises the
consolidated shape and does nothing, and it only falls back to the legacy keys
when the consolidated value is missing or is the broken bare-array shape. It
reads through the same injected storage the middleware uses, so the whole
persistence path can be exercised by a test without touching a device.

The store's transient download numbers stop being persisted and stop causing
writes, while the durable download status stays.

The remaining findings - one shared default for the HuggingFace search sort,
one definition of the onboarding key, the duplicated persist adapters, the
in-place `loaded` mutations, the stale comment, and the untracked repository
folders - are cleaned up in the same pass, because they all live in the modules
being touched.

## User Stories

### The user's state survives a restart

1. As a user, I want the model I selected to still be selected after I close
   and reopen the app, so that I can start chatting without re-picking it.
2. As a user, I want my per-model display names and prompt overrides to
   survive a restart, so that I do not retype them.
3. As a user, I want my remote API providers to survive a restart, so that my
   remote models are still reachable.
4. As a user, I want my "attach my HuggingFace token" preference to stay as I
   set it, so that the app does not start sending my token to the Hub without
   my consent.
5. As a user, I want my privacy acknowledgement to stay acknowledged, so that
   I am not asked to re-confirm it every launch.
6. As a user, I want the tool-compatibility notice to stay a one-time notice,
   so that I am not warned about the same model forever.
7. As a user, I want the memory guard (the largest model that has fit on this
   device) to survive a restart, so that the app keeps recommending models I
   can actually run.
8. As a user, I want my pending projector-cleanup queue to survive a restart,
   so that orphaned projector files are still reclaimed.
9. As a user, I want my HuggingFace search filters (author and sort order) to
   survive a restart, so that my search view is the same every time.
10. As a user, I want downloading a model not to disturb any of my settings,
    so that a download never costs me my configuration.
11. As a user, I want bookmarking, removing, importing, or toggling vision on
    a model not to disturb any of my settings, so that the catalog and my
    configuration are independent.
12. As a user, I want the app to be killed at any moment - by the OS, by a
    crash, by a battery pull - and my state to still be intact at the next
    launch, so that I never lose work to a background kill.
13. As a user on an older install, I want my existing models, selection and
    settings carried over when the app updates, so that the update is
    invisible.
14. As a user on an older install, I want my provider keys moved into the
    secret store and never left in plain storage, so that my keys are not
    readable in a backup.
15. As a user, I want the app to never keep a second, conflicting copy of my
    model state, so that the two copies cannot drift apart.
16. As a user, I want my downloaded model files to still be recognised as
    downloaded after a restart, so that I am not offered to download a model
    I already have.

### One writer per field, one shape on disk

17. As a developer, I want each persisted field to have exactly one writer,
    so that fixing persistence is a one-place change.
18. As a developer, I want the persisted model state to have exactly one
    recognizable on-disk shape, so that "what is on disk" is a decidable
    question.
19. As a developer, I want the legacy-migration routine to be a defensive,
    one-time reader rather than a routine that runs on every launch, so that a
    healthy install never re-enters it.
20. As a developer, I want the migration to still recognise the broken
    bare-array shape and recover from it, so that devices which ran the
    affected build are not left in a worse state.
21. As a developer, I want the legacy keys to be read but never written again,
    so that the on-disk state converges to one place.

### Testability

22. As a developer, I want to drive the models store's whole persistence path
    from a fake key-value storage, so that I can test cold starts without a
    device.
23. As a developer, I want the migration to read and write through the same
    injected storage the middleware uses, so that one fake covers both paths.
24. As a developer, I want to seed a fake storage with an old install's
    on-disk state, so that I can test the upgrade path.
25. As a developer, I want to seed a fake storage with the broken bare-array
    shape, so that I can test recovery from it.
26. As a developer, I want a test that performs two cold starts and asserts
    the state after the second one, so that a persistence regression cannot
    ship again.
27. As a developer, I want the persistence tests to assert what the user sees
    and what is on disk, rather than which internal function called which, so
    that refactoring does not break the tests.

### Less wear on the phone

28. As a user, I want a download's progress updates not to rewrite my whole
    model catalog to disk several times a second, so that a download does not
    make the app sluggish or drain the battery.
29. As a developer, I want the transient download numbers to be absent from
    the persisted state, so that the persisted state matches what the type
    contract already says.
30. As a developer, I want the durable download status to stay persisted, so
    that a downloaded model is still known to be downloaded.

### Consistency

31. As a developer, I want the shared persist adapters to live in one module
    and be imported by every store that needs them, so that a change to the
    storage contract has one home.
32. As a developer, I want the onboarding storage key defined once, so that
    the two definitions cannot drift.
33. As a developer, I want the dead onboarding helpers removed, so that the
    module only offers things the app actually uses.
34. As a user, I want the HuggingFace search sort default to be the same on a
    fresh install and after an upgrade, so that the app behaves identically
    however I got it.
35. As a user, I want my saved HuggingFace search filters carried over on
    upgrade, so that an update does not silently reset my search view.
36. As a developer, I want the stores to publish their "loaded" flag through a
    state update, so that a component which reads it will actually re-render.
37. As a developer, I want one way to declare the list of persisted fields,
    so that adding a field does not require learning two conventions.
38. As a developer, I want the stale note in the migration left behind by an
    earlier approach removed, so that it does not read as an unresolved
    problem.

### A repository you can clone and run

39. As a developer, I want to clone the repository and run the test command
    successfully, so that I can start working without fixing the checkout
    first.
40. As a developer, I want the documentation and specs folder tracked in the
    repository, so that the guidance the project gives agents actually
    exists on a fresh clone.
41. As a developer, I want the vendored reference app to be either tracked or
    explicitly ignored, so that `git add .` can never sweep a whole third
    party application into my commit by accident.
42. As a developer, I want the committed Android project to match the app
    config and the config plugins that generate it, so that a build from a
    clean checkout behaves like a build from my working copy.
43. As a developer, I want the one-off scripts and test output left at the
    repository root removed or ignored, so that my diffs stay readable.
44. As a user, I want the API key sitting in the project folder to be
    rotated and the file deleted, so that a key-shaped secret is not sitting
    in a directory that gets copied around.

## Implementation Decisions

- **One writer per field.** The persist middleware owns the persisted model
  state. Every hand-rolled writer that wrote a storage key is either removed
  or reduced to an in-memory state update:
  - the catalog's `saveModels()` (which wrote the bare array over the
    middleware's blob) is removed, along with its call sites;
  - the remote-provider writer, the remote-capability writer, the model
    settings writer, the tool-compatibility warning writer, the memory-guard
    writer, the pending-projection-cleanup writer and the active-model writer
    no longer write to storage;
  - the removal of the active-model legacy key is dropped.
  The state updates those functions performed stay exactly as they are, so no
  call site changes.

- **The on-disk shape is `liai_models` -> `{ state, version }` and nothing
  else.** The bare-array shape is never written again. The storage key name
  stays the same, so an install that already holds a consolidated blob is
  untouched by this work.

- **The legacy migration becomes defensive.** It reads the consolidated key
  first. If the value parses to an object carrying a `state` property, it does
  nothing - that is the healthy path. Otherwise it treats the value as a
  legacy install: a bare array is taken as the model list, and the remaining
  fields are recovered from the legacy keys where those keys still exist. It
  then writes the consolidated blob and clears the legacy keys it consumed.
  The legacy keys are never written again, so the recovery path converges to a
  single source of truth.

- **The migration reads through the injected storage.** The models store is
  built by a factory that takes a key-value storage; the migration currently
  bypasses it and reaches for a module-level singleton. After this change
  every read and write of the models store's persistence - the middleware and
  the migration alike - goes through the injected storage. The module-level
  singleton remains only as the production instance handed to the factory.

- **No version, no migrate.** The repository's persistence policy is
  "fresh": a breaking change to the persisted shape is handled by changing
  the storage key, not by a version number and a migration function. This work
  introduces no version or migrate machinery, and the consolidated blob keeps
  the version field it already has.

- **Transient download fields are not persisted.** The persisted copy of each
  model drops the byte-level progress fields and the transfer speed, and keeps
  the durable download status. The boot-time reconcile already re-derives the
  progress numbers from the native downloader, so nothing the user can see is
  lost.

- **Progress ticks no longer cause a write.** The persist configuration grows
  a "should persist" predicate that compares the persisted slice of the new
  state with the persisted slice of the previous state and skips the write
  when they are identical. A progress tick changes only fields the persisted
  slice excludes, so it produces an identical slice and no disk write.

- **One shared set of persist adapters.** The stores that currently define
  their own key-value-to-state-storage adapter and their own gated storage
  import the shared helpers instead, and their local copies are deleted. The
  gated storage keeps its existing meaning: writes are suppressed until the
  store has finished hydrating.

- **The "loaded" flag is published with a state update.** The watch store and
  the inference store set their loaded flag in place today; they publish it
  through the store's own state update so subscribers are notified.

- **The onboarding key is defined once.** The key constant moves to a single
  owner, the onboarding service's unused exports are removed, and the store
  imports the constant it needs.

- **One search-sort default.** The initial search filters and the migrated
  search filters use the same exported default. The migration additionally
  reads the saved search-filters key when it is present, so an upgraded user
  keeps their search view instead of getting the default.

- **One way to declare persisted fields.** The models store adopts the
  field-list form the inference store already uses, so both read the same way
  and a new field is added the same way in both.

- **Repository hygiene.** The test-runner script folder and the documentation
  folder are tracked. The vendored reference application is left out of the
  repository and explicitly ignored - it is a read-only reference, and
  tracking a third-party application would put its own licence and history
  into this repository's history. The Android project is regenerated from the
  app config and the config plugins and committed, so the tracked native
  project matches the sources that generate it. The one-off migration script
  and the captured test output at the repository root are deleted, and the
  scratch material folder is ignored.

- **Key rotation is a human step.** The environment backup file that holds
  the provider key is deleted from the working tree, but rotating the key
  itself happens in the provider's dashboard and is reported, not automated.

## Testing Decisions

- **A good test asserts external behaviour only.** A test seeds what is on
  disk, performs a cold start, and asserts two things: the state the user
  would see, and the bytes left on disk. It does not assert which internal
  function wrote the bytes, or how many reads a particular routine issued.

- **One seam: the models store factory that takes an injected key-value
  storage.** The whole feature is tested through it - the migration, the
  middleware, and the cold-start sequence. No new seam is introduced and no
  test-only hook is added to the store. The existing seeded in-memory storage
  fake in the Jest harness is the storage implementation, and the existing
  injected secret loader in the models storage module is the secret
  implementation.

- **Prior art.** The existing models hydration test already fakes storage at
  the module boundary and counts reads, and the existing storage-secrets test
  already exercises a module through an injected loader. The new tests follow
  both patterns, except that they seed the fake rather than mocking the
  module, so that two cold starts can be driven against the same on-disk
  state.

- **The regression test that matters most.** Seed a consolidated blob with a
  populated model settings map, an active model, a remote provider, the token
  preference turned off, the privacy acknowledgement set and a non-empty
  warning list. Cold start, mutate the catalog (bookmark a model), cold start
  again. Assert every one of those values is still there, and that the value
  on disk is the consolidated shape and not a bare array. This test fails on
  the current code.

- **The upgrade test.** Seed the legacy keys as an older install would have
  left them. Cold start. Assert each legacy value landed in the store, that
  the consolidated blob was written, and that the legacy keys were cleared.

- **The recovery test.** Seed the consolidated key with a bare array (the
  shape the affected build leaves behind) plus the legacy keys. Cold start.
  Assert the model list survives and the settings are recovered from the
  legacy keys.

- **The single-writer test.** Cold start, mutate the catalog, and assert that
  none of the legacy keys were written and that the consolidated key holds
  the consolidated shape.

- **The write-volume test.** Change only a model's download progress and
  assert that the storage received no write; change the model's download
  status and assert that it did.

- **The existing hydration test is updated, not deleted.** Its exact read
  count is an implementation detail of the old multi-key read and must be
  relaxed to "one pass over the storage" once the migration only reads the
  legacy keys when it has to.

- **The rest of the suite stays green.** The full test command and the type
  check both pass after the change, and the storage-secrets contract, the
  single-flight hydration guard and the model upgrade helpers keep their
  current behaviour.

## Out of Scope

- The chat store, which persists through a local database rather than
  key-value storage.
- The onboarding, search, voice, watch, inference and companion stores' own
  persistence behaviour - they are consumers of the shared persist helpers,
  not part of this fix.
- Versioning and migrate machinery. The repository's "fresh" policy stands:
  a breaking change to a persisted shape is handled by changing the storage
  key.
- A runtime schema-validation library for persisted state. Validation stays
  hand-written in the merge step, as it is today.
- Recovering settings that were already lost by a device that ran the
  affected build and had its legacy keys deleted. This work prevents further
  loss and recovers what is still recoverable.
- The parts of the audit that were not checked: the inference, text-to-speech,
  voice, agent and database services, the screens and components, the native
  download module, and the config plugins themselves.
- Running the app on a device or a simulator, and measuring the write-volume
  improvement on real hardware.
- Rotating the provider key itself.

## Further Notes

- **The audit this spec comes from rated this "must fix" but understated the
  trigger.** The audit described it as a narrow window - the app being killed
  between two writes during hydration. Reading the catalog slice shows the
  array write is the *last* thing that happens after every catalog mutation,
  and that mutation includes every download-progress tick. The persisted value
  on disk is therefore the bare array for as long as the app is not doing
  something else, and whether the next launch reads a healthy blob depends on
  what the final write before the app was backgrounded happened to be.

- **The legacy keys are what made it survivable, and also what made it
  unrecoverable.** The per-field writers kept the legacy keys current, which
  is why some values could be rebuilt after a clobbered blob. But the
  migration deletes those keys, and the per-field writers only write when the
  value *changes* - so a value that had not been touched since the last
  migration had nothing left to rebuild it from.

- **A device that already ran the affected build may have lost settings that
  cannot be recovered.** The legacy keys are deleted on first run of the
  consolidated build. This work cannot restore what is already gone; it stops
  it from happening again and rescues the cases where a legacy key still
  exists.

- **The secret-store contract is unchanged.** Provider keys and the
  HuggingFace token stay in SecureStore and stay out of the persisted slice.
  The removal of the plain-text scrubbing write is safe because the persist
  configuration already excludes the key fields from the persisted slice.

- **The model catalog itself is the one thing that always survived.** The
  bare array carried the models, so no user lost a downloaded model file to
  this bug. The loss was configuration: selection, settings, providers,
  preferences and queues.

- **Repository vocabulary.** The project has no glossary or decision records
  yet, so this spec uses the terms the code already uses: model catalog,
  model settings, remote API provider, memory guard, tool-compatibility
  warning, pending projection cleanup, consolidated blob, legacy keys.
