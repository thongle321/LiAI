# 07: Increase context ladder sheet

**What to build:** A sheet offering larger context sizes for the current model as a ladder, each stop showing its memory cost, an approximate word capacity, and a fits / tight / won't-fit marker, defaulting to the first size that fits. Confirming reloads the model at the new size; if the reload fails the previous size is restored and the model is left loaded rather than unloaded.

**Blocked by:** 05 — The remaining context banner variants; 06 — Context fit classifier

**Status:** ready-for-agent

- [ ] The ladder offers only sizes larger than the current context and no larger than the model's own maximum.
- [ ] Each stop shows its memory cost and approximate word count, and a colour-coded fits / tight / won't-fit marker.
- [ ] Sizes are labelled in thousands, so a twelve-thousand-token stop reads "12K".
- [ ] The sheet opens with the first size that fits selected.
- [ ] Confirming reloads the model and reports success or failure to the user.
- [ ] A failed reload restores the previous size and leaves the model loaded.
- [ ] When no larger size fits, the sheet says so plainly and offers a new chat instead of a confirm button.
- [ ] The context-full banner's "More room" action opens this sheet, and is absent when no larger size fits.
- [ ] Sheet text warns that reloading takes a few seconds and that nothing in the conversation is lost.
