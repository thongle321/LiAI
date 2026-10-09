# 01: Storage-fit decision module

**What to build:** The rule that decides whether a model will fit on the device,
as a pure function with no I/O, so it can be exercised directly. Free space that
cannot be read is treated as not fitting. A required size that is not a positive
finite number is treated as not fitting. An exact fit is allowed and one byte short
is not. A vision model's requirement is the model plus its projector.

Nothing user-visible changes in this ticket. It exists so that the two tickets
gated on it have something testable to call.

**Blocked by:** None (can start immediately)

**Status:** done
- [x] A pure decision answers "does this model fit, given this much free space", taking the model's required size, any projector size, and the free-space reading
- [x] Free space that could not be read is treated as not fitting
- [x] A required size that is not a positive finite number is treated as not fitting
- [x] An exact fit is allowed; one byte short is not
- [x] A vision model's requirement is the model size plus its projector size
- [x] The decision is covered by an exhaustive truth table rather than a handful of happy-path cases
- [x] The shape follows the existing learned-ceiling load guard, which is the established pattern for a "should we proceed" predicate with no native seam
- [x] No user-visible behaviour changes yet
