<div align="center">
  <h1>LiAI</h1>
  <p>An AI companion for Android.</p>
</div>

LiAI is a mobile-first AI companion that can run supported models on your device. Chat with local language models, talk hands-free, show the camera what you are looking at, create reusable companions, or connect a compatible remote provider when you need one.

> [!IMPORTANT]
> LiAI uses native modules for local inference, camera access, and speech, so it requires a **development build**. Expo Go is not supported.

> [!NOTE]
> This repository contains the mobile client and is under active development. Store distribution and production signing still need to be configured by the project owner.

## Features

- **Conversations** — multiple sessions, streaming local responses, Markdown and code rendering, image attachments, link previews, reasoning/tool steps, and JSON or Markdown export.
- **On-device models** — RAM-aware model recommendations, Hugging Face downloads, local GGUF import, memory checks, and automatic model offloading.
- **Remote models** — custom OpenAI-compatible endpoints and OpenRouter, with provider credentials stored on the device.
- **Voice** — system or downloadable neural text-to-speech, Whisper speech recognition, and hands-free voice conversations.
- **Vision** — camera context for multimodal local or remote models when the active model supports it. Vision turns are ephemeral and are not added to chat history.
- **Companions** — create reusable assistant and roleplay companions with their own prompts, parameters, model, and tools.
- **Tools and web search** — date/time, safe calculation, inline HTML previews, and opt-in web search and page reading.
- **Local persistence** — chat history and companions in SQLite through TinyBase, preferences in AsyncStorage, and secrets in SecureStore.

Once the required model and voice assets are downloaded, local chat, speech, and vision features can work without a connection.

## Tech stack

| Area | Technology |
| --- | --- |
| App | Expo SDK 58, React Native 0.88, React 19.3, strict TypeScript 6 |
| Navigation and UI | Expo Router, Uniwind, Tailwind CSS, Expo UI, Lucide icons |
| State and persistence | Zustand, TinyBase, Expo SQLite, AsyncStorage, SecureStore |
| Local AI | `llama.rn` for GGUF inference, `whisper.rn` for speech recognition, ONNX Runtime and Phonon for speech |
| Device features | VisionCamera, Expo Image Picker, Expo Speech, Expo Speech Recognition |
| Tooling | Bun 1.4.4, Jest, Expo development builds |

## Requirements

LiAI targets **Android and iOS**. The web script in `package.json` is not the primary supported target.

### Android

- Android Studio with Android SDK 37 and a compatible JDK
- Android 8.0 (API 26) or newer

See the official [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) and [development build guide](https://docs.expo.dev/develop/development-builds/introduction/) for platform setup details.

## Quick start

```bash
git clone https://github.com/thongle321/LiAI.git
cd LiAI
bun install --frozen-lockfile

# Build and run the native development build
bun run android
```

After the first native build, start Metro for the installed development client with:

```bash
bun run start --dev-client
```

Bun applies the checked-in dependency patches during installation. A JavaScript reload is not enough after native dependency, plugin, or native-project changes; rebuild the development client instead.

### First launch

1. LiAI detects the device memory and recommends a model tier.
2. Download a suggested model or skip the download and continue to the app.
3. Open **Models** to download a preset, search Hugging Face, import a local GGUF file, or add a remote provider.
4. Open **Companions** to choose or create a companion, then start chatting or speaking.

## Development commands

| Command | Purpose |
| --- | --- |
| `bun run start` | Start the Metro development server |
| `bun run android` | Build and run the Android development client |
| `bun run ios` | Build and run the iOS development client on macOS |
| `bun run typecheck` | Type-check the app and Jest project |
| `bun run test` | Run the Jest test suite |

## Privacy

- Local model inference and downloaded voice assets keep the core experience on the device.
- Chat history and companions are stored locally in `liai-chat.db`; model metadata and preferences use AsyncStorage.
- Remote models, web search, and page reading send request data to the provider you configure. Those features are opt-in.
- Camera and microphone access are requested only when the corresponding feature is used.
