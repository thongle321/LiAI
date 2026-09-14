# 01: Durable conversation storage on Supabase

**What to build:** conversation history survives server restarts. The same chat API keeps working unchanged, but environments that opt in persist sessions and turns in Supabase instead of process memory. Key-free local development keeps working exactly as today.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Versioned SQL migration creates normalized sessions/messages storage (one session row, one row per turn with role, content, timestamp); applied to the Supabase project via SQL editor/CLI, never by the app at boot
- [ ] New persistence module implements the existing conversation-store protocol (create/get/append over portable role/content turns) using the official Supabase client with the service-role key from server-side environment only
- [ ] Supabase SDK contact stays inside the persistence module; protocol, agent, adapter, and API contract are unchanged
- [ ] Reads return the most recent 100 messages (existing 50-exchange window); no DB triggers or deletion logic
- [ ] Store backend selected explicitly via environment (`memory` default, `supabase` opt-in); no auto-detection
- [ ] Existing suite stays green with no keys; live conformance battery runs against the real project when keys are present, skips with a clear reason otherwise
- [ ] Service credentials appear nowhere in code, repo files, API responses, or the mobile client
- [ ] No auth, multi-user isolation, RLS policies, streaming, tools, or realtime in this slice
