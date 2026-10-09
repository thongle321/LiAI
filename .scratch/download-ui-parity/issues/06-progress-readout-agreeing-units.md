# 06: Progress readout — agreeing units and a readable bar

**What to build:** The progress caption's byte figure and speed figure are
formatted against different unit bases, so one line can read with two numbers that
disagree by about five percent. They now agree. The progress bar also adopts the
reference app's proportions, which are larger than ours and easier to read while a
multi-gigabyte transfer runs.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The byte figure and the speed figure in one caption are formatted against the same unit base and cannot disagree
- [ ] Byte formatting stays decimal
- [ ] The ETA keeps its current form, including rendering a large number of minutes rather than hours — that is the reference app's output
- [ ] A test pins that the two figures on one caption agree
- [ ] The progress bar is eight pixels tall with a five-pixel radius, drawn with this app's colour tokens
- [ ] Every download surface uses the same bar; the reference app's gradient wash on Hugging Face file cards is not adopted
