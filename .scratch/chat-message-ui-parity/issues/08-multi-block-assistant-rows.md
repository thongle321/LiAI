# 08: Multi-block assistant rows

**What to build:** An assistant reply renders as a sequence of sibling blocks within one row — reasoning, text, a tool surface, more text — in the order the model produced them. Today a turn carries one reasoning string and renders tool results inside the text bubble, so the data model cannot express the interleaving and has to change.

**Blocked by:** 03 — Stopping state and live tool-call token count

**Status:** ready-for-agent

- [ ] A turn that reasons, calls a tool, then answers renders the reasoning, the tool surface and the text in that order inside a single row.
- [ ] A tool surface renders as a sibling block rather than nested inside the text bubble.
- [ ] Copy and text-to-speech see the whole turn's text, not one fragment of it.
- [ ] A turn with no tools renders exactly as it does today, with no visual change.
- [ ] A stored conversation reopens with the same block structure it was written with.
- [ ] An existing backup restores and renders without loss.
