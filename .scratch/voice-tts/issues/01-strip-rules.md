# 01: Strip rules before speech

**What to build:** Speaking a reply never reads junk aloud. Reasoning/think
tags, fenced code blocks, inline code, links, image markup and table
syntax are removed from the text before it reaches any TTS engine — both
auto-speak and the per-message play button. (Spec Q10; ported from
PocketPal's `ThinkingStripper`, extended with the markdown-lite rules.
The "Hmm, let me think" placeholder phrase is deliberately NOT included —
it is a streaming affordance deferred to phase 2.)

**Blocked by:** None (can start immediately).

**Status:** done

- [x] A pure cleaner takes raw assistant text and returns speakable text: think/reasoning tags removed, fenced + inline code removed, links reduced to their label (or removed if labelless), image markup and table syntax removed, prose preserved.
- [x] The cleaner handles text arriving as one final string (v1 speak-on-completion path).
- [x] Existing speak path (auto-speak + per-message play) routes through the cleaner.
- [x] `node --test tests/*.test.ts` covers each rule with representative fixtures; `npm run typecheck` green.

## Comments

Resolved 2026-10-13 on integration/voice-tts (coding-only run). All acceptance boxes verified: npm test 1291/1291, typecheck clean.
