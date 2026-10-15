Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 16 — Agent, tool, and inference depth

Retired guards in the agent/inference areas that the current Jest suite does
not reach. `lib/agent/__tests__/search.test.ts` and
`lib/inference/__tests__/*` cover the transport and engine seams, so what is
missing is the loop above them.

Retired guards:

- `local-agent-run`, `local-agent-talents`, `local-talents`,
  `tool-metrics` — the agent loop over injected engine + search, the talent
  registry (names, arg parsing, allowlist enforcement), and tool call
  metrics (`lib/agent/runner.ts`, `lib/agent/talents.ts`,
  `lib/agent/registry.ts`, `lib/agent/allowlist.ts`,
  `lib/agent/untrusted.ts`).
- `reasoning`, `reasoning-capability`, `thinking-capability`,
  `thinking-detection` — reasoning detection, the capability flags a model
  reports, and the thinking probe (`lib/inference/thinking.ts`,
  `lib/inference/thinking-detection.ts`,
  `lib/reasoning-capability.ts`).
- `offload`, `engine-init-wiring`, `remote-caps`, `generation-settings`,
  `inference-manager` — KV offload patch, init-param wiring, remote
  capability negotiation, generation settings persistence.
- `link-preview`, `markdown*` link extraction, `http-retry`.

## Acceptance

- [ ] `lib/agent/__tests__/` gains a runner suite driving a scripted engine
      plus a scripted search, and a talents/allowlist suite.
- [ ] `lib/reasoning-capability.ts` and `lib/inference/thinking*.ts` have
      behavior tests.
- [ ] `lib/inference/offload.ts` has a behavior test for the KV-offload
      patch it builds.

## Context pointers

- Existing seam: `lib/chat/__tests__/local-turn.test.ts` (scripted engine),
  `lib/agent/__tests__/search.test.ts` (scripted fetch)
- Retired guards: `git show HEAD~1:tests/legacy/local-agent-run.test.legacy.ts`
- Spec: `.scratch/jest-test-migration/spec.md` (user stories 9, 13)
