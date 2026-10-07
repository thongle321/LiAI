# 06: Context fit classifier

**What to build:** A pure classifier that answers one question for a candidate context size — can this model be loaded here? — returning fits, tight, or won't fit. It compares the memory a load at that size would need against a safe ceiling and against the device's total memory. No UI in this ticket.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A size whose memory requirement is at or below the ceiling classifies as fits.
- [ ] Above the ceiling but at or below total device memory classifies as tight.
- [ ] Above total device memory classifies as won't fit.
- [ ] When device memory cannot be read, tight is never returned.
- [ ] The memory requirement comes from the same estimator the model-load path uses, so the number shown to the user is the number the loader acts on.
- [ ] The classifier is pure and unit-tested without a device or a loaded model.
- [ ] A helper reports whether any larger size actually fits, so no caller can open a picker with nothing to pick.
