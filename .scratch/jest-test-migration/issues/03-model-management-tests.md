Status: done
Type: task
Blocked by: 01

# Ticket 03 — Port model management tests

Port and adapt applicable PocketPal model store, download/job, GGUF metadata,
memory fit, model grouping, projector pairing, model settings, and remote model
tests for LiAI. Resolve any missing model behavior surfaced by the tests.

## Acceptance

- [ ] Core model state and model readiness behavior are tested.
- [ ] Download progress, error, resume, and retry behavior are tested where available.
- [ ] GGUF and metadata-related behavior is tested through public utilities.
- [ ] Memory estimation and storage disclosure behavior are tested.
- [ ] Projector and vision-related model behavior is tested.
- [ ] Model UI behavior tests are added alongside pure module tests where applicable.
- [ ] Missing model management capabilities are implemented as needed to pass tests.

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- PocketPal model-related modules/tests as reference only.
- LiAI model and download library modules.
