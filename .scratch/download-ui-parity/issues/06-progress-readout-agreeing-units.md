# 06: Progress readout — agreeing units and a readable bar

**What to build:** The progress caption's byte figure and speed figure are
formatted against different unit bases, so one line can read with two numbers
that disagree by about five percent. They now agree. The progress bar also
adopts the reference app's proportions, which are larger than ours and easier
to read while a multi-gigabyte transfer runs.

**Blocked by:** None (can start immediately)

**Status:** done

## Acceptance criteria

- [x] The byte figure and the speed figure in one caption are formatted against
      the same unit base and cannot disagree
- [x] Byte formatting stays decimal
- [x] The ETA keeps its current form, including rendering a large number of
      minutes rather than hours — that is the reference app's output
- [x] A test pins that the two figures on one caption agree
- [x] The progress bar is eight pixels tall with a five-pixel radius, drawn with
      this app's colour tokens
- [x] Every download surface uses the same bar; the reference app's gradient
      wash on Hugging Face file cards is not adopted

## Comments

Shipped in `c0b3da7`. The caption's speed divisor moved from 1024 to 1000 to
match `formatBytes`, so the worked example in the test is `5,000,000 B/s` →
`5.00 MB/s` where a 1024 divisor printed `4.77`. Both quirks the ticket
protects are preserved deliberately and say so in the module's header.

The bar's `h-1` was 4px; it is now `h-2` with `rounded-[5px]`. All three
download surfaces already routed through the shared bar, so no caller changed.
`ContextFullBanner`'s track is also 4px but is a message-width indicator, not a
download surface, so the ticket did not apply to it — left alone on purpose.
