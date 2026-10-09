# 03: Continuous storage disclosure on every download surface

**What to build:** Every surface that offers a Download button checks storage
continuously while it is on screen. When the model will not fit, the button greys
out and the card states the shortfall inline — the model's size against the free
space. When the user frees space, the button re-enables by itself, with no remount
and no app restart.

Today free space is read once when the preset accordion opens, and the result is
applied only to Hugging Face bookmark cards. Preset cards, which is where most
people download from, get no disclosure at all.

**Blocked by:** 01 — Storage-fit decision module

**Status:** ready-for-agent

- [x] Storage is re-read on an interval while a download card is mounted, rather than read once
- [x] When the model will not fit, the Download button is disabled and the card states the model's size and the free space inline
- [x] Once space is freed, the button re-enables without remounting or restarting the app
- [x] The check covers preset cards, Hugging Face bookmark cards, Hugging Face search file rows, and the onboarding picker
- [x] Surfaces with no Download button — the ready-models list, the projector picker, the failure dialog — are untouched
- [x] A failed storage read leaves the user with an explanation rather than a silently disabled button and no reason
- [x] The inline wording follows the reference app's form
- [x] The check consumes the storage-fit decision rather than re-deriving the rule
