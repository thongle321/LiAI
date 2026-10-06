# 01: Prove table alignment renders, close audit §3.3

**What to build:** A GitHub-flavoured markdown table written with column alignment — `|:---|---:|:--:|---:|` — renders each column aligned as written, and a regression test locks that in. The markdown library is believed to apply per-column text alignment to each cell before the app's renderer ever sees it, in which case this ships as a test and an audit correction rather than a feature.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A test renders a markdown table with left, centre and right delimiter columns and asserts each column's cells carry the expected text alignment.
- [ ] If that assertion already passes against the current renderer, no production change is made and the audit records §3.3 as closed, with this test as the guard.
- [ ] If it fails, the cell renderer applies the alignment per column and the test passes.
- [ ] A table written without alignment delimiters is unaffected and still renders flush-left.
- [ ] The horizontal scroll behaviour for wide tables is unchanged.
