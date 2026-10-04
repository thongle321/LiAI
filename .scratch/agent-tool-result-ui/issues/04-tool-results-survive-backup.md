# 04: Tool results survive backup and restore

**What to build:** A backed-up conversation keeps its tool surfaces. Today, export and import round
a conversation's text but not the record of which tool calls failed — so a restored conversation
loses the very distinction this work exists to preserve, and an old failure looks like a clean run.

This ticket carries the outcome kind across the export boundary and rebuilds it on import.

**Blocked by:** 01 — A failed tool call becomes visible (it owns the new field), 02 — A web search
shows its hits (it establishes what a complete tool surface looks like)

**Status:** ready-for-agent

- [ ] An exported conversation carries the outcome kind for each tool call, and the export format's
      version is unchanged.
- [ ] An imported conversation's tool calls are rebuilt field by field, preserving which calls
      failed.
- [ ] Row identifiers are still minted fresh on import rather than read from the file, so importing
      the same backup twice produces two conversations instead of one overwriting the other.
- [ ] Tool-call data that this version cannot restore is counted and reported to the user, exactly
      as unrecoverable turn data already is — a partial restore is never presented as a complete
      one.
- [ ] A backup file carrying malformed or hostile tool-call data is refused or bounded, consistent
      with the existing import trust boundary; nothing untrusted reaches the store unvalidated.
- [ ] Importing a conversation written before this change works, and its tool calls read as
      unknown outcome rather than as success.
- [ ] The export and import round trip for tool calls is covered, including the twice-imported case.
- [ ] The restore path for tool data is covered at the seam that validates untrusted files, not only
      at the store.