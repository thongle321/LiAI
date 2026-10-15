Status: ready-for-agent
Type: task
Blocked by: 08

# Ticket 10 — Model download lifecycle: resume, retry, preflight, error copy

The models download path is the largest single gap left by the migration.
Its guards lived in `tests/legacy/` and mixed two kinds of test:

- **Pure rules** that are already covered or nearly covered:
  `lib/models/download-error.ts`, `lib/models/download-jobs.ts`,
  `lib/models/resume-state.ts`, `lib/models/progress.ts`,
  `lib/models/http-retry.ts`, `lib/models/storage-fit.ts`.
- **Source scans** pinning the wiring in `store/models/downloads.ts`:
  `download-preflight` (fail closed on an unreadable free-space reading,
  refuse before any transfer begins), `download-no-auto-activate`,
  `download-jobs`, `resume-state`, `android-capabilities`,
  `android-download-driver`.

The source scans are the interesting part. They guard real invariants —
"a download that cannot fit never starts", "a resumed download does not
re-activate a model the user never picked", "the latest job wins" — but
pinning them as text means a refactor that keeps the behaviour fails the
test. Porting them properly needs the download service's collaborators
(file system, background downloader, catalog) injected rather than imported,
which is a production refactor larger than the guards.

## Acceptance

- [ ] `lib/models/*` pure download rules (error copy, jobs, resume state,
      progress, retry budget, storage fit) have behavior tests.
- [ ] The download-start wiring is either refactored to be injectable and
      tested behaviorally, or the remaining source scans are converted to
      `readSource()`-based guards in a colocated test with a comment saying
      why behavior is not reachable, and the follow-up is closed.
- [ ] A follow-up is recorded for the native download driver paths, which
      are device-verified only (`modules/native-download` is unreachable
      from `npm test`).

## Context pointers

- Spec: `.scratch/jest-test-migration/spec.md`
- Production: `lib/models/download-error.ts`, `lib/models/download-jobs.ts`,
  `lib/models/resume-state.ts`, `lib/models/progress.ts`,
  `lib/models/http-retry.ts`, `store/models/downloads.ts`,
  `lib/android-download-service.ts`, `modules/native-download`
- Retired guards: `git show HEAD~1:tests/legacy/download-*.test.legacy.ts`
