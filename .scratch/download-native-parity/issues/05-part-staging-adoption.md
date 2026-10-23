# 05: `.part` staging, atomic commit, and adoption

**What to build:**

End the write-straight-to-final-path behavior (`RandomAccessFile(dest, "rw")`, `DownloadWorker.kt:238`) and port the reference's staging discipline — this reverses the audit's "deliberate non-divergence 1", now marked REVERSED 2026-10-23:

- Stream bytes to `destination + ".part"` (`PART_SUFFIX`, `DownloadEngine.kt:347`); on success run `commit()` (`295-306`): final `writeProgress`, size check (`totalBytes > 0 && partLength != totalBytes` → delete the part + fail `SIZE_MISMATCH_ERROR = "Downloaded file size does not match the expected size"`), then atomic `part.renameTo(file)` (rename failure → `Failed("Could not move the finished download into place")`).
- Port `adopt()` (`158-176`) to reconcile disk state with the row at run start: proceed when the part exists or the final is absent; a newer COMPLETED row at the same destination (`byDestination`, `createdAt >`) → `End.Superseded` → the row is CANCELLED; an unknown-size in-place file is removed ("Could not remove the previous download" if removal fails); a final file exactly `totalBytes` long is adopted → writeProgress + Completed; otherwise the file is renamed to `.part` ("Could not move the partial download aside" on failure).
- Teach the JS resume seams the new staging: `store/models/downloads.ts` `onDiskBytes()` (:118-133) and `reconcileInterrupted` (:444-500), `services/models/resume-state.ts` `classifyFileOnDisk`, and the retry path — partials now live at `+.part` (classification reads the part with `resumeDataForPartial`), while "whole model on disk" detection still stats the final path only. All final-path statting the audit flagged as the reversal's exact risk is hereby reworked in the same change so resume/retry can never misread a part.

Ship the ported tests first: adopt() branches (proceed/superseded/remove-unknown/exact-file/rename-aside), commit() rename + size-mismatch delete, a mapper test for `.part` awareness in the pure JS classifiers, and the store-level test that a `+.part` file classifies as paused while a final file classifies as completed.

**Blocked by:** 01, 04 (Room v2 columns), 03 (commit relies on validated totals)

**Status:** ready-for-agent

Acceptance:

- [ ] A download in flight writes only `*.part`; the final path appears atomically via rename on success
- [ ] Size mismatch deletes the part and fails with "Downloaded file size does not match the expected size"; rename failure fails with "Could not move the finished download into place"
- [ ] adopt() covers all five branches per the reference (proceed / superseded→CANCELLED / remove-unknown / exact→Completed / rename→part)
- [ ] JS: `onDiskBytes`, `classifyFileOnDisk`, `reconcileInterrupted`, and the retry path are all `.part`-aware; a part classifies as paused (resumable bytes), never as completed
- [ ] Ported suites green (`gradlew` native + Jest `npm test` for the JS seams); `npm run typecheck` clean
