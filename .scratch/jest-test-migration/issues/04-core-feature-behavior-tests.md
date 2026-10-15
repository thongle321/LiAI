Status: done
Type: task
Blocked by: 01

# Ticket 04 — Port remaining core feature behavior tests

Port and adapt PocketPal applicable tests for inference, sampler, storage/session
storage, local model access, voice loop and speech integration, vision turn and
multimodal availability, search providers/state, inference settings, and
onboarding behavior. Resolve missing feature gaps surfaced by the tests.

## Acceptance

- [ ] Inference manager/engine/sampler behavior tests are ported or adapted for LiAI's implemented inference paths.
- [ ] Persistence and session storage behavior tests cover corruption, retry, and active pointer behavior.
- [ ] Voice loop, speech recognition/synthesis, and TTS engine metadata tests cover public behavior.
- [ ] Vision turn, image handling, and multimodal availability tests are ported or adapted.
- [ ] Search state and provider tests cover LiAI's search implementation.
- [ ] Onboarding behavior tests cover implemented onboarding screens and state.
- [ ] Settings and inference configuration behavior tests are ported for implemented settings.
- [ ] Missing core capabilities are implemented as needed to pass tests.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- PocketPal feature modules and tests as reference only.
- LiAI lib/store implementations for each feature area.
