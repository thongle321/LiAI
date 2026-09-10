# LiAI

## Project Overview

LiAI is a multimodal AI companion for mobile.

The product is companion-first rather than education-first. It combines
natural conversation, vision, voice, memory, tools, and optional
learning capabilities into a persistent personal AI companion.

## Core Capabilities

- AI Companion — Natural conversation with a consistent personality and context.
- AI Vision — Understands camera input, images, objects, scenes, and visual context.
- Voice Conversation — Supports spoken interaction and AI voice responses.
- Memory — Retains useful conversation and user context.
- Learning Assistant — Teaches and explains concepts when requested.
- Web Search — Retrieves current external information when needed.
- Personal Assistant — Helps with everyday tasks and information.
- Document Understanding — Understands supported documents and user-provided content.
- Context Awareness — Maintains context across conversations.
- Personality System — Defines the companion's behavior and communication style.
- Custom Voice — Supports configurable AI voices.
- Real-Time Vision — Supports continuous camera-based interaction.
- Tool Calling — Allows the AI to use external tools and APIs.

## Architecture

The project consists of:

- `mobile/` — React Native + Expo mobile application.
- `backend/` — Python backend, AI agents, model integrations, tools, memory, and APIs.

The mobile application communicates with the backend for server-side
AI capabilities and application services.

## General Principles

- Keep the architecture simple and maintainable.
- Prefer clarity over unnecessary abstraction.
- Build features incrementally.
- Do not rewrite unrelated code.
- Do not introduce major dependencies without a strong reason.
- Ask before adding new major dependencies.
- Never expose secrets or private API credentials to the mobile client.
