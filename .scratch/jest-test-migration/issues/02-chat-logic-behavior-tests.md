Status: done
Type: task
Blocked by: 01

# Ticket 02 — Port chat logic and store behavior tests

Port PocketPal-style chat storage, session, turn, streaming, regenerate, edit,
retry, import/export, and warning behavior tests for LiAI's chat chat store and
lib, adapting imports and behavior to LiAI architecture. Resolve any missing
chat feature gaps surfaced by the tests.

## Acceptance

- [ ] Colocated chat store tests use injected fake store/runner dependencies.
- [ ] Session lifecycle tests cover load, reconciliation, active pointer, switch, rename, pin, delete, and new conversation.
- [ ] Turn tests cover stream/finalize, reasoning, tool steps, failure, retry, regenerate, and blocked/in-flight sends.
- [ ] Edit mode tests cover enter, cancel, commit, identity preservation, and mid-turn refusal.
- [ ] Multimodal warning and warning lifecycle behavior are tested.
- [ ] Import/export happy path and invalid path are tested.
- [ ] Chat logic tests are Jest behavior tests rather than source-text checks.
- [ ] Missing LiAI chat behaviors are implemented as required to make tests pass.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Existing LiAI chat store and fake builders from current tests.
- PocketPal chat tests as reference only.
