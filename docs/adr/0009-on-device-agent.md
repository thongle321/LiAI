# ADR-0009: Agent loop and talents run on-device

Date: 2026-09-24
Status: Accepted
Supersedes: ADR-007 (backend agent/talents)

## Context

The agent loop (`companion/agent.py`) and the four talents (datetime,
calculate, web_search, read_url) execute in the backend with SSE `tool`
events to the client (ADR-007). With inference moving on-device (ADR-0008),
the loop and its tools move with it, following PocketPal's in-app
`AgentRunner` + `TalentRegistry` shape: stream → detect tool calls →
dispatch engines → feed results back under a turn budget → force a final
answer. The four talents port as local engines; `render_html` stays deferred
(it needs `react-native-webview`, still not approved).

## Decision

- **Port `AgentRunner` + `TalentRegistry` principles, not the files.** A
  name-keyed engine registry; engines are generic, the turn opts in by name.
  Turn budget (PocketPal's `DEFAULT_MAX_TURNS = 5` shape) with a
  budget-exhausted nudge forcing a final answer. The chat store's `send()`
  calls the runner directly with token/tool/usage callbacks updating the
  same bubbles — the XHR/SSE transport path is deleted, not kept as fallback.
- **Networked talents call providers directly from the app** with SecureStore
  BYOK keys (Tavily/Brave, consent-gated as today): with no backend, the
  ADR-004 "backend performs the call" rule cannot hold for search — it is
  amended to a direct-BYOK exception (keys still never leave SecureStore
  except per-request over TLS, never logged).
- **`read_url` uses PocketPal's reader strategy** (researched, not invented):
  provider-native `read()` when the active search provider offers one,
  otherwise the keyless `r.jina.ai` default reader which returns clean plain
  text — no new dependency, no `trafilatura` equivalent needed. The
  exfiltration guards port with it: http(s)-only, no embedded credentials,
  allowlist limited to URLs from this conversation's `web_search` results or
  the user's own messages, results fenced as untrusted, output clipped by a
  token budget.
- **Pure talents stay pure:** datetime, safe-calculate, budget clip, and the
  untrusted-content wrapper port as tested logic; only the HTTP seams are new.

## Consequences

> Superseded in part by ADR-0012: tool-call provenance persists to the local
> Store's `toolRuns` table, not to Supabase. The rest of this record stands.

- Tool-call provenance keeps persisting with the turn (now to Supabase,
  ADR-0010) so steps re-render after reload.
- Web-search quality depends on the user's own provider keys; offline means
  calculate + datetime only, stated in UI rather than hidden.
- `render_html` remains the only deferred talent, still gated on a WebView
  decision.
