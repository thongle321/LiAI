# 09: Record the conscious divergences in the parity audit

**What to build:** The parity audit is the reference for what already matches the
reference app. This feature deliberately leaves several things different, and each
one reads like an oversight unless its cost is written down. Give each a row.

**Blocked by:** 02 — Refuse a download that cannot fit; 03 — Continuous storage disclosure; 07 — Stop auto-activating downloads

**Status:** ready-for-agent

- [ ] The audit gains a row for each deliberate divergence this feature leaves in place: pause retained, retry resuming rather than restarting, no auto-activation, no hours branch in the ETA, and no global download overlay
- [ ] Each row states the cost of the divergence, not merely that it exists
- [ ] Any existing audit row this feature reverses is updated — in particular the previous policy of attempting a download when free space is unknown
- [ ] The audit does not claim parity for anything left deliberately different
- [ ] The audit's existing rows that remain true are left alone
