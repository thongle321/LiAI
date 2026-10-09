# 02: Refuse a download that cannot fit

**What to build:** When the user taps Download and the device cannot hold the
model — or storage cannot be read at all — the download is refused before any
bytes move, and the failure the user sees names storage as the cause.

This reverses the previous policy, which attempted the transfer when free space
was unknown. A download that fails reports its own failure honestly; a
permanently disabled button does not.

**Blocked by:** 01 — Storage-fit decision module

**Status:** ready-for-agent

- [ ] Starting a download consults the storage-fit decision before any transfer begins
- [ ] Free space that cannot be read refuses the download rather than attempting it
- [ ] A refusal records the model's failure with a message the failure dialog already classifies as a storage problem, so its existing title, body and numbered fix-it steps are what the user sees
- [ ] No bytes are written and no partial file is created when a download is refused
- [ ] The wiring is guarded by a source assertion, since the models store imports the filesystem and the native download module and cannot be imported under the test runner
- [ ] The blast radius of failing closed is recorded in the spec's risk notes: a device whose free-space read always throws can never start a download
