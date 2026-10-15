Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 13 — Component and UI behavior coverage

`components/chat/__tests__/PendingIndicator.test.tsx` is currently the only
component test in the suite. Everything else in the retired Node suite was
a source scan — it could pin that a `Pressable` had an `accessibilityRole`,
or that a contrast pair passed AA — but it could not render and assert.

Most of those guards are now properly testable: React Testing Library renders
the real component, Uniwind is stubbed in `jest.setup.ts`, and the store
seams are injectable. The tasks below are ordered by the cost of getting
them wrong.

Retired guards:

- `a11y-roles` — text-bearing pressables announce as buttons.
- `color-contrast` — theme token pairs meet AA on text.
- `touch-targets` — minimum hit-slop on interactive rows.
- `font-scale`, `text-scale` — the dynamic-type scale ladder.
- `markdown-links`, `markdown-tables`, `html-preview`,
  `html-preview-bubble` — the markdown/link-preview surfaces.
- `pending-phase` — the pending row's phase label and the plain-text phase.
- `message-list`, `message-width`, `turn-footer` — row layout and the turn
  footer's usage line.
- `settings-pattern`, `settings-sheets`, `sheet`, `truesheet-scroll` — the
  settings row/sheet conventions.
- `model-card-anatomy`, `models-ui`, `models-dialog-copy`,
  `models-hardening`, `voice-ui`, `thinking-pill`, `preset-catalog`,
  `preset-dismiss`.

Note that `color-contrast`, `touch-targets`, `font-scale` and `a11y-roles`
were written as *file* scans because they sweep the whole component tree,
not one component. Porting them means either a render sweep (slow, and
Uniwind-stubbed) or a source scan through `jest/source.ts` — decide per
guard and record the choice in the test.

## Acceptance

- [ ] Chat surfaces (message list, turn footer, pending row phases,
      composer gating) have render tests.
- [ ] Models surfaces (card anatomy, download row states, details sheet)
      have render tests.
- [ ] Settings/voice/sheets have render tests for at least one row each.
- [ ] The sweep-style a11y/contrast/touch guards are either ported or
      explicitly re-scoped, with the reason recorded in the test header.

## Context pointers

- Existing pattern: `components/chat/__tests__/PendingIndicator.test.tsx`
- Native stubs: `__mocks__/external/@expo/ui.tsx`,
  `__mocks__/external/react-native-marked.js`
- Retired guards: `git show HEAD~1:tests/legacy/a11y-roles.test.legacy.ts`
