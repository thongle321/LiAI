# ADR-0008: On-device-first AI architecture; FastAPI backend retired

Date: 2026-09-24
Status: Accepted
Supersedes: ADR-003 (backend-owned inference), ADR-006 (backend GGUF runtime)

## Context

LiAI's chat, agent loop, talents, search, and GGUF serving all run in the
Python/FastAPI backend; the app is a presentation client that cannot function
without the server (ADR-003, ADR-005, ADR-006, ADR-007). The goal is a
mobile-first app whose primary features work with no LiAI server: inference,
tools, and search run on the device, chat history lives in Supabase, and the
backend is retired. PocketPal is the architectural reference: it runs GGUF
inference on-device with `llama.rn` behind a `CompletionEngine` interface,
executes an `AgentRunner` + talent engines in-app, and keeps remote endpoints
as a second engine — but its MobX/paper/WatermelonDB stack is not ported; only
the principles transfer to LiAI's Zustand/Uniwind/Expo Router stack.

## Decision

- **Inference runs on-device via `llama.rn`.** Downloaded GGUFs load into a
  local context behind a `CompletionEngine` interface (PocketPal's
  `LocalCompletionEngine` shape): `completion(params, onToken)` streaming plus
  `stopCompletion()`. The `LlamaCppChatProvider` / `resolve(model_id, byok)`
  backend path (ADR-006) is deleted with the backend.
- **Multimodal on-device for vision.** Vision-capable GGUF + `mmproj` file
  served by `llama.rn`; the standalone vision screen and in-chat image attach
  feed the local multimodal context. The backend VLM path goes with the backend.
- **Remote endpoints stay as fallback, user-owned only.** PocketPal's
  `OpenAICompletionEngine` shape becomes the BYOK remote path (user's own
  OpenRouter/custom endpoint, SecureStore key); there is no app-owned default
  model anymore. Local-first with remote fallback is a later wave; first cut
  is local-only with the remote engine behind the same interface.
- **Custom native builds accepted.** `llama.rn` is native: Expo Go stops
  working, EAS dev-client builds become required (user-accepted).
- **The FastAPI backend is retired** once the on-device cut lands (user
  decision): deleted, not archived as a fallback. Supabase + device replace it.

## Consequences

- New native dependency `llama.rn` (plus EAS dev-client workflow); Expo Go
  no longer runs the app.
- Model activation gains a real on-device meaning: download/import → load
  into the local context. One model slot; switching releases the previous.
- PocketPal's on-device tuning machinery (context init params, draft/MTP,
  GPU/thread knobs, RAM calibration) is ported only as needed — the tier
  presets already guide model choice.
- No server to pay for, no network needed for core chat; GGUF quality and
  phone RAM become the quality ceiling, documented not engineered around.
