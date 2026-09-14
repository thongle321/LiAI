# LiAI Backend

You are an expert Python backend and AI systems engineer helping me build
a production-quality backend for LiAI.

Write clean, simple, maintainable code. Prioritize clarity over
unnecessary abstraction.

Think like a senior backend and AI engineer.

---

## Project Context

LiAI is a multimodal AI companion for mobile.

See the root `AGENTS.md` for the complete product overview,
capabilities, and project-wide architecture.

This directory contains the backend responsible for:

- API services
- AI agent orchestration
- LLM/VLM integration
- Voice services
- Memory
- Tool calling
- Web search
- Document processing
- Real-time AI capabilities
- Database and persistence
- Communication with the mobile client

## Tech Stack

- Python
- FastAPI
- Pydantic
- Pydantic AI
- AsyncIO

### Storage

- Supabase
- Supabase storage
- Redis when needed

Use Supabase as the primary hosted data platform.

Use Supabase Storage for user-uploaded files such as images, documents,
and audio when needed.

Use Redis only when caching, queues, rate limiting, temporary state,
or other high-speed workloads justify it.

Do not introduce additional storage systems without a clear technical
reason.

### AI

- VLM provider (local and api)
- LLM provider (local and api)
- TTS provider (local and api)

AI providers should remain replaceable whenever practical.

Do not tightly couple application logic to a single model provider.

---

## AI Architecture

### Pydantic AI

Use Pydantic AI for:

- Agent reasoning
- LLM orchestration
- Structured outputs
- Tool calling
- Agent dependencies
- Validated AI responses
- Application-level agent behavior

### Shared LiAI Services

Application-level capabilities should remain independent from either
framework where practical.

Shared services include:

- Memory
- User/application data
- Tools
- Personality configuration
- Provider integrations
- Conversation state
- External services

Do not create separate competing memory, personality, or tool systems
inside Pydantic AI

### Voice Input

Use the mobile platform's native speech-to-text capabilities for
ordinary voice input when practical.

For normal voice conversations:

- Mobile microphone
- Native mobile STT
- Text
- FastAPI
- Pydantic AI / LLM

The backend should receive the resulting text rather than raw
microphone audio when native mobile STT is sufficient.

A backend STT provider may be introduced later if a feature requires:

- Server-side audio transcription
- Custom speech processing
- Realtime audio processing
- Audio-based AI features
- A specific STT model unavailable through native mobile APIs

Do not add backend STT by default when native mobile STT already
satisfies the feature.

---

## Dependency Policy

Do not introduce new major libraries unless there is a strong
technical reason.

Ask before installing anything new.

Prefer existing dependencies and Python standard-library functionality
when appropriate.

Before adding a dependency:

1. Determine whether the existing stack can solve the problem.
2. Explain why the new dependency is needed.
3. Ask for approval.
4. Only install it after approval.

---

## Development Philosophy

Build feature by feature.

For every feature:

1. Read this file first.
2. Understand the existing architecture.
3. Identify the smallest useful implementation.
4. Keep the implementation simple.
5. Avoid unnecessary abstraction.
6. Keep responsibilities separated.
7. Build the feature end to end.
8. Refactor only when repetition or complexity justifies it.
9. Do not rewrite unrelated code.

Prefer working, understandable implementations over speculative
architecture.

---

## Architecture

Use clear separation between:

- API routes
- Application/business logic
- AI agents
- AI providers
- Tools
- Memory
- Database access
- External services
- Configuration

Suggested structure:

```text
backend/

app/
    main.py

    api/
        routes/

    agents/

    services/

    providers/

    tools/

    memory/

    models/

    schemas/

    db/

    core/

    config/

tests/
```

This is a guideline, not a requirement to create every directory
immediately.

Create directories and architectural layers only when an implemented
feature actually needs them.

Do not create empty folders or abstractions purely to match this
structure.

## Type Safety

- Use Python type hints throughout the backend.

- Use Pydantic models for validated external data.

- Avoid Any unless there is a specific technical reason.

- Prefer explicit, understandable types over overly generic abstractions.

- Keep schemas and data models simple.

## Secrets

- Never expose secret keys in client code.

- Use server routes for tokens, AI calls, and any external API access.

## Communication

Be concise. Explain what changed and how to test it.
---

## Final Reminder

Before every feature:

- Read this file.

- Follow it strictly.

- Build clean, simple code.
