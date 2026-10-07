# 11: Populate GGUF metadata from the model header

**What to build:** When a model finishes downloading, is imported locally, or is reconciled on startup, its GGUF header is read and stored on the model record. Two things become possible that are impossible today: the model's **maximum trained context length** is known, and the memory estimate reflects the model's real key-cache requirement instead of a flat multiple of file size.

This is not a feature the user sees directly. It is the missing input that makes two other pieces of work real — the context ladder cannot be bounded without a maximum context length, and the fit classifier currently compares byte figures that do not change when the context window grows.

The model record already declares a metadata field. Nothing in the codebase has ever written to it.

**Read `.scratch/chat-message-ui-parity/research/blockers.md` before starting** — it carries the file-level trace, the exact key shape, and the two hook points. Do not re-derive it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] After a download completes, the model record carries metadata read from the GGUF header at rest.
- [ ] The same read happens when a locally-present model is reconciled or imported, so an already-downloaded model gains its metadata without being re-fetched.
- [ ] The model's maximum trained context length is readable from that metadata, resolving the architecture-prefixed key and accepting values that arrive as strings.
- [ ] A model whose header cannot be read leaves the metadata absent, and neither the download nor the model load is blocked or failed by that.
- [ ] The read does not run on every app start — only at download, import or reconcile.
- [ ] Header values are sanitised before being written into the persisted record, using the sanitiser that already exists for this field.
- [ ] No schema migration: an existing install keeps working and simply gains metadata the next time a model is downloaded or reconciled.
- [ ] Remote models are unaffected. Their context length remains the server's configured setting and is never presented as the model's trained maximum.
- [ ] For a local model the memory estimate is no longer a flat multiple of file size, and instead follows the model's real key-cache requirement at the requested context length.
- [ ] A test proves the maximum-context read resolves the architecture-prefixed key, coerces a string value, and returns nothing rather than guessing when the header lacks the key.