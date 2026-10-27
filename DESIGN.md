---
name: LiAI
description: A calm mind. A smarter everyday.
colors:
  # Signal Blue is ONE hue carried by two steps — never two colours.
  # `signal` carries anything read or filled; `signal-mark` is the board's
  # original #3882F6, kept for non-text marks. See The Two-Step Rule.
  signal: "#2563EB"
  signal-mark: "#3882F6"
  # Hover and pressed — a third step, darker still. Never an accent of its own.
  deep-signal: "#1D4ED8"
  coolant-cyan: "#06B6D4"
  surface-tint: "#EFF6FF"
  jade: "#10B981"
  # One step, not two. #B45309 was the lightest amber clearing 3:1, and it
  # still failed 4.5:1 on its OWN 10% tint — which the fit chip paints — so
  # text and mark roles share this value rather than splitting like the reds.
  amber: "#92400E"
  # Same two-step split as the signal: `alert-red-mark` is the border/dot
  # value, `alert-red` the one that carries text and solid fills.
  alert-red: "#B91C1C"
  alert-red-mark: "#EF4444"
  cool-paper: "#F8FAFC"
  clean-white: "#FFFFFF"
  mist: "#F1F5F9"
  hairline: "#E2E8F0"
  hairline-strong: "#CBD5E1"
  ink: "#0F172A"
  slate: "#475569"
  muted: "#5F6B7C"
  alert-tint: "rgba(239, 68, 68, 0.12)"
  scrim: "rgba(15, 23, 42, 0.6)"
typography:
  display:
    fontFamily: "Inter"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: "40px"
  headline:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
  title:
    fontFamily: "Inter"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "28px"
  # The pocketpal mirror rungs (docs/research/font-size-comparison.md):
  # screen titles, labels/descriptions, and interface meta.
  screen-title:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  label:
    fontFamily: "Inter"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
  meta:
    fontFamily: "Inter"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: "14px"
  body:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "Inter"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  micro: "2px"
  small: "4px"
  default: "8px"
  large: "12px"
  x-large: "16px"
spacing:
  "0": "0px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-solid:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.clean-white}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-solid-hover:
    backgroundColor: "{colors.deep-signal}"
  button-outline:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.signal}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-destructive:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.clean-white}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-disabled:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.slate}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  icon-button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.clean-white}"
    rounded: "999px"
    size: "48px"
  icon-button-secondary:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.signal}"
    rounded: "999px"
    size: "48px"
  input-default:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.default}"
    padding: "12px 16px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.clean-white}"
    rounded: "{rounded.default}"
    padding: "24px"
  card-muted:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.default}"
    padding: "24px"
  message-bubble-user:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.large}"
    padding: "12px 16px"
    typography: "{typography.body}"
  nav-header:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.ink}"
    height: "56px"
  tab-bar:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.slate}"
    height: "67px"
  tab-active:
    textColor: "{colors.signal}"
  ai-listening:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.signal}"
    rounded: "999px"
    size: "56px"
---

# Design System: LiAI

## Overview

**Creative North Star: "The Quiet Instrument"**

> *Inferred, not confirmed.* You declined the North Star and voice questions, so this is derived from the board's own words — the tagline "A calm mind. A smarter everyday." and the stated intent "a subtle sci-fi aesthetic that feels advanced, not overwhelming… Realistic, not overly stylized." Rename it freely; nothing downstream depends on the specific words.

LiAI is a light system with exactly one loud thing in it. A single blue hue does all the signalling — the live tab, the focused field, the one primary action, the active step — carried in two steps of that one hue, and everything else is a near-white plane separated by 1px hairlines. The restraint is the point. Where most AI products reach for gradients, glass, and glow to feel futuristic, this one earns "sci-fi" from 2px line icons, corner brackets, and a dot trail. Nothing emits light.

The density is conversational, not dashboard. Space is generous — a 4px scale with a 24px screen gutter and 24px card padding — because a phone screen held one-handed for conversation should breathe. Structure comes from alignment and hairlines, never from enclosure: cards are open white rectangles, not boxes. Type does the heavy lifting, with a nine-step Inter scale where Display (32/40) is reserved for one moment per screen, Screen title (14/20) carries every title, and Meta (10/14) is the floor.

**This file is the authority, and the code now implements it.** The build used to trail this file by a whole world — near-black surfaces, a lime accent, Raleway, soft elevation, clipped octagonal corners — and that world has since been retired out of the codebase entirely. What remains is to hold the line: see *Do's and Don'ts* for the guardrails that keep it retired.

**Key Characteristics:**

- **One signal.** Signal Blue marks exactly one live, selected, or actionable element per screen. Never two. It is one hue in two steps — see *Colors*.
- **No shadows, no glow, no gradients.** Depth is a 1px hairline (`#E2E8F0`) or a single step between three near-white surfaces.
- **Inter only.** Six sizes, three weights (400/500/600). Nothing renders below 12px.
- **4px grid, no exceptions.** Every margin, padding, and gap is a multiple of 4.
- **Flat rectangles.** The only circles are things you press (icon buttons, avatars) and things that listen (the mic).
- **The retired world.** Near-black surfaces, lime accents, Raleway, octagonal clipped corners, and emoji glyphs are all out.

## Colors

A light, cool-neutral palette built from three near-white planes and one confident blue.

### Primary

Signal Blue is **one hue in two steps**, and which step you pick is a contrast decision, not a preference. The board specified a single value; measured against real surfaces it could not do both jobs. A colour used as text or under a white label needs 4.5:1; the same colour used as a border, focus ring, icon or dot needs only 3:1. The board's value clears the second and fails the first at 3.69:1, so it became the mark step and a darker step of the same hue took the text and fill work.

- **Signal** (`#2563EB`): the system's voice, and the step that carries anything read or filled — the solid button, the active tab's icon and label, the ghost and outline button labels, a streaming dot, the send arrow. 5.17:1 on Clean White, and it holds 4.5:1 on all four grounds, which is why it is the fill step and not the board's original.
- **Signal Mark** (`#3882F6`): the board's original blue, kept for everything non-text — focus rings, input borders, chevrons, corner brackets, the active tab's mark, the Listening ring. 3.69:1 clears the 3:1 non-text floor, which is all a border or an icon is ever held to.
- **Deep Signal** (`#1D4ED8`): hover and pressed, and a third step darker still. It makes an already-blue element feel pressed; it is never an independent accent and never carries text.

### Secondary

- **Coolant Cyan** (`#06B6D4`): the secondary hue, reserved for **machine-in-the-loop moments** — the Thinking and Vision Active states, streaming indicators, and anything where the *system* (not the user) is the actor. It never styles a user-reachable control. If a component could plausibly use either blue, it uses Signal.

### Status

- **Jade** (`#10B981`): success and completion only. Pairs with a check glyph — never colour alone.
- **Amber** (`#92400E`): warning and degraded states: a paused download, a missing permission, a slow connection. It is the one status hue that does **not** split into two steps. The old `#F59E0B` measured 2.15:1 on Clean White — under both floors — while it carried 12px text as well as glyphs; the lightest step clearing 3:1 (`#B45309`) still failed 4.5:1 on its own 10% tint, and `bg-warning/10` is real paint on the fit chip. `#92400E` is the lightest amber clearing all three, so text and marks share it.
- **Alert Red** (`#B91C1C`): error and destructive action, and the step that carries text and solid fills. It is the only one of the reds that clears 4.5:1 on all four grounds — Clean White, Cool Paper, Mist and Surface Tint — so it is what a destructive button's fill and an inline error sentence use.
- **Alert Red Mark** (`#EF4444`): the border and dot step. A 1px error border, a destructive icon, a status dot — 3.76:1 is enough for all three, and it keeps Alert Red reading as one colour in the two places it appears.

### Neutral

- **Cool Paper** (`#F8FAFC`): the app background and the outermost plane. Every screen starts here.
- **Clean White** (`#FFFFFF`): the raised plane — cards, inputs, headers, the tab bar. This is the system's only "lift", and it is a value step, not a shadow.
- **Mist** (`#F1F5F9`): the recessed plane. Tracks, disabled fills, inactive chips, and any surface that sits *inside* something else rather than on top of the page.
- **Hairline** (`#E2E8F0`): the default 1px border. The workhorse separator.
- **Hairline Strong** (`#CBD5E1`): a hovered or emphasised border. Use to answer "is this row tappable?" without lifting it.
- **Ink** (`#0F172A`): all body and heading text. Primary text is always Ink, never a muted grey.
- **Slate** (`#475569`): secondary text only — timestamps, hints, counts, placeholders, unit labels, row descriptions. Slate is never used for a heading and never for a control label. One step darker than the board's `#64748B`, which passed on Clean White at 4.76:1 but failed on the two recessed grounds — 4.34 on Mist and 4.37 on Surface Tint — and a description is exactly the kind of text that lands on a tint.
- **Muted** (`#5F6B7C`): the quiet step, for text that should recede but is still **read** — a second-line description, a file's metadata, a URL under a provider name. It sits between Slate and the tints without touching either, and clears 4.5:1 on all four grounds (5.41 Clean White, 5.08 Cool Paper, 4.94 Mist, 4.97 Surface Tint). **Muted replaces the alpha habit:** `text-secondary-text/70` was the old way to recede and composited Slate to 3.59:1 on white — unreadable at 14px, invisible in review, and unverifiable by a token test because the alpha lives in the call site. Recede with Muted, or with a fill change; never with `/NN` on a text colour (`jest/design-system.test.ts` fails `npm test` on one).
- **Scrim** (`rgba(15, 23, 42, 0.6)`): modal and sheet backdrops.

### Tints

Two tints exist, and they exist for a specific reason: a selected element needs a ground to sit on.

- **Surface Tint** (`#EFF6FF`): the 50-step of Signal Blue's own hue. It is the fill of the user's message bubble, the assistant message card, and the Listening ring. It is a *ground*, never a border, an icon colour, or a text colour.
- **Alert Tint** (`rgba(239, 68, 68, 0.12)`): Alert Red Mark at 12% over Clean White. The fill of destructive icon buttons and error chips. It tracks the mark step, not the fill step, because a tint is a ground and never carries text.

> **Unresolved.** The board shows a green-tinted success card, a red-tinted error card, and a violet-tinted Speaking waveform, but its palette panel does not specify those three values. They are deliberately absent here rather than invented. Derive them the same way as the two tints above (a low-alpha step of the documented status hue) and add them as tokens when you settle them — do not let each component pick its own.

### Named Rules

**The One Signal Rule.** Signal Blue marks exactly one thing per screen — the single live, selected, or actionable element. If a second element needs blue, one of them is wrong. This is a rule about the *hue* and its scarcity, not about a step: both steps of Signal Blue are that one signal.

**The Two-Step Rule.** Every accent hue that does two jobs carries two steps of one hue, never one value and never two hues. The **mark step** is for anything non-text — borders, focus rings, icons, dots, chevrons — and is held to 3:1. The **signal step** is for anything read or filled, and is held to 4.5:1. Collapsing the two into one value is what put eighty-eight text sites and every primary button below AA; it is invisible in a screenshot, which is exactly why it has to be measured.

**The Measured Contrast Rule.** Contrast is arithmetic and is checked, never eyeballed. Text 4.5:1, marks 3:1, and the check runs against the real token values in `jest/design-system.test.ts`, which also fails if `themes/tokens.ts` drifts from `global.css`. A new colour is not finished until it passes there. Hairline dividers are the one documented exemption: a separator that carries no information of its own is decorative structure, not a control, icon or focus indicator, and at 1.23:1 it could never clear the non-text floor.

**The Native Palette Rule.** Switches, dropdown menus and sliders are real platform components, seeded from the signal step so they land in this system's world rather than the platform default. Seeded is not exact: they carry Material's tonal palette rather than these tokens, and their type is fixed at the system scale rather than following the user's type size. Treat the seed as an approximation of this system, never as a fourth colour and never as licence to hand-tune a native control's palette.

**The Tint Rule.** Tints are grounds for a selected element, nothing else. No tinted border, no tinted icon, no tinted text. If you want a selected element to read as selected, tint the surface it sits on and leave the border Hairline.

**The Scrim Rule.** Backdrops are near-black at 60% (`rgba(15, 23, 42, 0.6)`) and never take a hue. A tinted scrim turns a system dialog into a product statement. **Recorded exception:** the hand-rolled sheet in `components/Sheet.tsx` paints this scrim, and the four Material sheets cannot — `@expo/ui`'s community bottom sheet accepts no scrim prop, so those four use the platform default. The rule stands for anything the app draws; where the platform owns the backdrop, the platform wins, and the trade is recorded here rather than hidden.

**The Ink-and-Slate Rule.** Text is Ink, Slate or Muted, never blue, never a status colour, and never a third grey. Status colour lives in the icon or the surface, not in the sentence.

**The No-Alpha-Text Rule.** A text colour is never dimmed with an opacity modifier (`text-secondary-text/70`). Alpha on text cannot be measured by the contrast suite, because the suite reads tokens and the alpha lives in a call site — so the failure is structurally invisible to the check that is supposed to catch it, and to a screenshot. Three steps, in order: **Muted** (`text-secondary-text-muted`) for text that recedes but is read, a fill or colour change for anything else, and a new measured token when neither fits. Opacity remains legal on **fills** — Alert Tint is `rgba(239,68,68,0.12)` — and on nothing else.

## Typography

**Display Font:** Inter
**Body Font:** Inter
**Label/Mono Font:** none — Inter carries metadata, labels, and code. There is no monospace family and no second typeface.

**Character:** A single geometric grotesque doing every job, from 32px down to 10px. The personality comes from the weight and colour steps — Semibold headings in Ink, Regular body in Ink, Regular metadata in Slate — not from mixing families. Inter is specified with a fallback of any similar modern sans-serif; on native, load it through `expo-font` and gate first paint on the font resolving, so nothing flashes in the system typeface.

### Hierarchy

- **Display** (600, 32/40): one per screen at most. Onboarding welcome, the "You're set" confirmation, the About wordmark. Never inside a list, a card, or a chat bubble.
- **Headline** (600, 24/32): large in-app titles on surfaces with no PocketPal counterpart — the Voice screen's title and the onboarding model screen — which deliberately keep the old rung. Screen titles are Screen title below.
- **Screen title** (600, 14/20, `text-title`): every title in the app — the chat header wordmark, each ScreenHeader (Settings, Models, About), and model section headers. Mirrors PocketPal's `titleSmall` exactly; the numbers and per-section citations are in `docs/research/font-size-comparison.md`.
- **Title** (20, 500 Medium): a reserved rung — the Voice screen's centred sub-headline. Modal and sheet titles moved to Body Large (pocketpal dialog / `titleMedium` parity); settings cards carry their `Card.Title` at that same 16/24 regular size (see Settings).
- **Body** (400, 16/24): all reading text. Chat messages, descriptions, button labels, input values. On a 390pt-wide phone a full-width Body measure runs 34–40 characters; assistant bubbles cap at roughly 75% of viewport width so the line never exceeds that comfortable reading measure.
- **Body Small** (400, 14/20): supporting text that is read but not acted on — field hints, empty-state descriptions, author bylines, link-preview descriptions.
- **Caption** (400, 12/16): metadata — timestamps, session previews, status labels, quantisation chips, download speeds.
- **Label** (400, 11/16, `text-xs`): interface furniture that names a value rather than a thought — settings descriptions, generation labels, composer hints, tab labels (pinned 11/14 at the bar). Never a sentence the user must act on.
- **Meta** (400, 10/14, `text-micro`): the floor. Assistant footer counts and other passive telemetry.

### Named Rules

**The 16px Floor Rule.** Reading text is Body (16/24) by default and never smaller than Body Small (14/20). Everything below 14 is Label (11) or Meta (10) — furniture that names a value, never prose. Reaching for Caption to fit more words onto a line is a layout failure, not a type decision.

**The Single Family Rule.** One family, three weights. A second typeface or a monospace exception must be added to this file first, with a reason.

**The Caption Means Metadata Rule.** Caption, Label and Meta label things that happened or things that are counted — a time, a token total, a file size, a state name. They never carry a sentence a user is expected to act on.

**The Fluid Type Rule.** The scale above is authoritative at a **375dp base**; rendered sizes may drift from it by the device width, nowhere else. The drift is `1 + (width / 375 − 1) × 0.5`, clamped to **[0.9, 1.1]** and rounded to whole px, applied as `--text-*` overrides at the root (`themes/textScale.ts`, consumed by `hooks/useFluidTextScale.ts` through Uniwind's `ScopedVariables`). `themes/tokens.ts` and the contrast tests keep base values — the drift is presentation, not a second system, and no call site applies it by hand. The system accessibility scale composes on top of it. Where geometry is pinned, the system scale is capped so the pinned dimension never moves: the tab bar labels at **1.1**, header titles at **1.5**. Everything else — settings rows, chat, sheets, empty states — is uncapped and grows freely; that is the "dynamic type support" the accessibility floor asks for.

## Layout

The spatial model is a 4px scale — 4, 8, 12, 16, 20, 24, 32, 40, 48 — with **no off-scale values**. On Uniwind/Tailwind this scale is already the default (`p-1` through `p-12`), so no custom spacing configuration is needed; the discipline is in *choosing* from it, not in defining it.

**Token names are descriptive here and terse in code.** This file names colours and type steps by role — Signal, Signal Mark, Slate, Muted, Body Small — because that is what an agent should reach for. `global.css` and `themes/tokens.ts` mirror the same values under short names for use in class strings, and the two are the code mirror of this file, not a second system. Display, Headline, Title, Body, Body Small and Caption are `h1`, `h2`, `h3`, `h4`, `body-lg`, `body-md` and `body-sm`; Screen title, Label and Meta are `title`, `xs` and `micro`; Signal, Signal Mark, Deep Signal, Ink, Slate, Clean White, Cool Paper, Mist and Surface Tint are `primary`, `primary-mark`, `primary-hover`, `primary-text`, `secondary-text`, `secondary-text-muted`, `surface-1`, `base`, `surface-2` and `surface-3`. The values are identical in all three places, and a test fails if the CSS and TypeScript mirrors drift apart.

**Gutters and padding.** The screen gutter is one `6` step (24px) on every edge, including horizontal insets for cards, list rows, and form fields. Cards carry 24px (`6`) internal padding — generous, because a card is a small plane, not a dense module. Fields sit at 12px/16px (`3`/`4`) vertical/horizontal. Message bubbles sit at 12px/16px (`3`/`4`). (Stillness: bumped from 20px to 24px for breathing room.)

**The gutter does not apply to a full-bleed field.** A field docked to a screen edge takes no horizontal inset at all: its own 12px/16px padding *is* the whole inset, so its value sits 16px from the edge. This is not a stacked gutter — it is the gutter deliberately absent, which is what lets the element be the edge. The chat composer is the only such field today.

**Vertical rhythm.** Between a section heading and its first row: 8px (`2`). Between a heading block and the section below it: 24px (`6`). Icon-to-label inside a row: 8px (`2`) for icon buttons, 10–12px for the larger row icons. Never let a gap be a value you cannot name on the scale.

**Containers.** Surfaces are full-bleed or inset by the gutter; there is no centred max-width column. Chat is the one exception to horizontal rhythm — message bubbles are edge-anchored (user right, assistant left) and capped at roughly 75% of viewport width, because a chat reads as a column of alternating edges, not a stack of equal cards.

**Navigation geometry.** The header is 56px tall, sits on Clean White with a 1px Hairline bottom border, and holds a leading control, the wordmark, and trailing controls in slots of **equal width, sized to hold the wider of the two groups** — equal slots alone do not centre the wordmark if one group overflows its slot. The tab bar is 67px plus the device's bottom safe-area inset, with a 1px Hairline top border; the inset is applied once, at the bar, and screens opt out of it rather than double-applying it.

**Gutters are owned by one layer.** A screen gutter is applied once, at the outermost container of a column. A child that also insets itself stacks the gutter; that is the defect, not a style choice.

**Density.** Fixed-format rows (settings, model lists, session history) are 48–56px tall — the accessibility floor is **48×48dp** for every touch target (Android's Material minimum; iOS's 44pt is the lower bar and the shared target must clear the higher one), and a denser row is not worth the tradeoff. Prose surfaces (chat, empty states) are looser and centred. Where a control's *visual* is smaller than the floor, pad the hit area rather than the circle — never the reverse.

**Responsive behaviour.** Portrait is the design target (`orientation: portrait` in app config). On tablets the layout must not stretch: cap the content column at a 640pt reading measure (`CONTENT_MAX_WIDTH` in `components/ContentColumn.tsx`) and centre it in the viewport rather than letting cards span full width. The cap is a `maxWidth`, never an explicit `width` — an explicit width equal to the window overflows the moment any parent insets horizontally. Chat bubbles stay edge-anchored and are exempt — they are a conversation, not a column. Safe-area insets are applied exactly once per edge by whichever component owns that edge.

## Elevation & Depth

**This system uses no shadows.** There is no `box-shadow`, no `elevation`, no blur, and no glow anywhere in the product. Depth is communicated two ways only:

1. **Hairline borders.** A 1px line in Hairline (`#E2E8F0`) separates nearly everything. Hover steps it to Hairline Strong (`#CBD5E1`); focus steps it to Signal Mark (`#3882F6`).
2. **Surface value steps.** Three near-white planes stack in a fixed order: Cool Paper (`#F8FAFC`) is the page, Clean White (`#FFFFFF`) is the raised element, Mist (`#F1F5F9`) is the recessed element. A card is white on paper. A track inside a card is mist on white. That is the entire depth model.

Modals and sheets add a third, separate layer: the Scrim (`rgba(15, 23, 42, 0.6)`) over everything, with the sheet itself on Clean White.

### Named Rules

**The Hairline Rule.** Every separation is a 1px line or a single surface step. If a design needs a drop shadow to be legible, the border is too light or the surface step is missing — fix that instead of adding depth.

**The No-Glow Rule.** Nothing emits light. No shadow, no inner glow, no coloured blur, no neon. Sci-fi is signalled by geometry — 2px line icons, corner brackets, dot trails — not by luminance.

**The Mask Gradient Rule.** A gradient is never decoration, but it earns one job: **fading a value out at a truncation edge** so clipped text reads as "there is more" instead of chopped mid-glyph. Exactly one place ships it today — the chat-template preview in Model Settings (`TemplatePreview`, an SVG `LinearGradient` from the sheet's own fill to transparent over the right 30% of the row), mirroring the reference app's `MaskedView`. It paints no colour, no hue, no luminance: it is a mask over the surface colour. Anything that fades for spectacle rather than to mark a cut is banned like any other gradient.

**The Three-Plane Rule.** Only three surface values exist. A fourth is a bug: either something is raised (Clean White) or recessed (Mist), and nothing is both.

## Shapes

Corners are soft but never round. The radius scale has five named steps and they are chosen **by role**, never by eye:

- **Micro** (2px): the inner radius of small filled controls — a 20px checkbox, a 4px progress fill, the active tab indicator.
- **Small** (4px): dense inline elements — chips, badges, code spans, tags.
- **Default** (8px): the workhorse. Buttons, inputs, cards, dropdown menus, list containers. Most of the system sits here.
- **Large** (12px): message bubbles, segmented controls, sheets, prominent icon-button wells.
- **X-Large** (16px): modal cards and the largest single surfaces. Reserve it — if everything is x-large, nothing is.

**Among rectangular elements, radius 0 is the one value outside the scale, and only on a full-bleed element.** An element that bleeds to a screen edge takes square corners, because a rounded corner there notches the surface away and exposes whatever is behind it — a visible defect, not a preference. Every inset rectangle uses one of the five steps above. (The 999px circle form below is a separate form language and is not a rectangle; this exception is about corners on a rectangle.) The chat composer is the only full-bleed element today.

**Fully circular controls (999px) are a separate form language, not a sixth step.** They are permitted for exactly two things: things you press (icon buttons, avatars, the FAB) and things that listen (the mic control). Rectangular controls are never fully circular.

**Borders are always 1px and always Hairline.** There is no 2px border and no 3px border, with one exception: the vision corner brackets, which are drawn as four separate L-shaped corner marks rather than as a border, because a frame is a HUD element, not a container.

**Clipping.** Content that overflows a rounded corner is clipped to that radius. Images inside cards and bubbles clip to the card's radius, never to their own.

### Named Rules

**The Radius Names Rule.** Pick a radius by role, not by proportion. Micro for inner radii, Small for inline chips, Default for buttons/inputs/cards, Large for bubbles and sheets, X-Large for modal cards. If you are choosing between two steps, choose the smaller one.

**The Circle Is For Touch Rule.** A full circle means pressable or listening. If a circular element is neither, it is a Default-radius rectangle that got drawn wrong.

**The No-Clipped-Corners Rule.** Chamfered, octagonal, and cut-corner shapes belong to the retired v0 world. Every corner in this system is a plain radius.

## Components

### Buttons

Confident and flat. Buttons never lift, never glow, and never animate their own geometry.

- **Shape:** Default radius (8px), 44px minimum height, 10px/20px (`2`/`5`) internal padding, Body (16/24) labels.
- **Solid (primary):** Signal (`#2563EB`) fill, Clean White label. **The default choice.** One per screen. *Dark theme:* the signal fill is a light blue (`#5B8CFF`), where a Clean White label measures 3.16:1, so `on-primary` steps to Ink there (6.18:1). The token carries the label role; the value follows the fill's side of the scale.
- **Solid hover/pressed:** Deep Signal (`#1D4ED8`) fill on hover; Deep Signal plus a 2% scale-down on press.
- **Outline (secondary):** Clean White fill, 1px Signal Mark border, Signal label. Hover steps the border to Deep Signal. Use for the second action of equal importance.
- **Tonal:** Surface Tint (`#EFF6FF`) fill, 1px Signal Mark border, Signal label. This is PocketPal's `btnPrimary` shape and LiAI's Load/Offload button. **Recorded exception to The Tint Rule:** Surface Tint is otherwise a ground for a *selected* element and never a button fill — this is the one button that uses it, because the reference's tonal treatment is what makes a secondary-but-primary-in-context action read as quieter than Solid without going outline. Its three steps are the same tokens Outline already uses; only the ground differs, so it adds no colour.
- **Ghost (tertiary):** transparent fill, no border, Signal label. Use for the third-and-beyond action, and for destructive-adjacent actions that should not compete with a solid red.
- **Destructive:** Alert Red (`#B91C1C`) fill, Clean White label. Reserved for irreversible actions — delete, wipe, revoke. If a screen has both a solid primary and a destructive action, the destructive one is Outline with an Alert Red Mark border and label, not a second solid.
- **The download green** is a fourth ground, and the only place Jade's family carries an action rather than a state: three tokens (`success-fill` `#ECFDF5`, `success-mark` `#059669`, `success-deep` `#047857`) standing in for PocketPal's `btnDownload` trio, pinned by `jest/design-system.test.ts` at 4.5:1 for the label on all four surfaces and 3:1 for the border. Jade itself (`#10B981`) is a fill and tint step only: at 2.54:1 on Clean White it is under the 3:1 mark floor, so every check glyph that used to take it now takes `success-mark`, and it never carries text.
- **Disabled:** Mist fill, Slate label, no border, no shadow. Disabled is a *fill and label* change, never opacity on a live element — the element must still be legible enough to be found.

### Icon Buttons

- **Shape:** Fully circular (999px), 40px (`10`) diameter, 2px stroke icon centred at 20px.
- **Primary:** Signal (`#2563EB`) fill, Clean White icon. Reserve for the single most important action in a surface — the send arrow, the primary add.
- **Secondary:** Surface Tint fill, Signal icon. The default for every other icon-only control.
- **Destructive:** Alert Tint fill, Alert Red Mark icon. **Recorded exception — no site carries this value yet.** `alert-tint` is declared in this file's frontmatter and the rule above holds, but it is not implemented in `global.css` or `themes/tokens.ts`, so there is no `bg-alert-tint` class to use. The destructive grounds in code use `bg-error/10` (#B91C1C at 10%) with an `error` (#B91C1C) glyph instead of Alert Tint with `error-mark` (#EF4444). Closing the gap means adding the token as a third mirror — `jest/design-system.test.ts` normalises both files' values through one parser, so an rgba value mirrors like any hex — and migrating the three existing error grounds at `components/models/ModelCard.tsx`, `components/models/HFModelSearch.tsx` and `components/chat/ContextFullBanner.tsx`. Recorded rather than half-done: one surface moved and two not would read as two systems. `docs/research/2026-10-10-model-card-architecture-parity.md` §7 carries the detail.
- **Touch target:** the visual circle is 40px; the touch target is 48×48dp minimum. Pad the hit area, not the circle. A control whose visual is already the target (the voice mic) takes its target straight from the visual.
- **Recorded exception — bare icon actions inside a card.** The model card's settings and expand controls put the glyph bare in the 48px target: no 40px well, no fill. This reads *Touch target* literally rather than contradicting it, and it is the reference app's own shape (`styles.iconButton` is a bare 40px touchable). A row of three actions each wearing a Surface Tint well reads as three controls competing for state when only one is live — DESIGN.md's "cards are open white rectangles, not boxes" argues the same way from the other side. Circles and wells stay for standalone controls (the FAB, the send button, avatars), and destructive keeps both its ground and its circle.
- **Every icon-only button carries an accessibility label.** No exceptions, including destructive and decorative-adjacent controls.

### Chips / Badges

Small categorical labels that carry a short token word (engine tier, default, status). They are not controls and never accept a tap.

- **Shape:** Pill (999px), `2px` vertical / `8px` horizontal padding.
- **Typography:** Label (11/16) Semibold, `0.4px` tracking. Label rung, never smaller.
- **Signal tier:** Surface Tint (`#EFF6FF`) fill with Signal (`#2563EB`) label. Default badge language - see `.voice-badge`.
- **Warm tier:** `#ffedd5` fill with warm deep (`#c2410c`) label, only where Warm means "local/on-device" (a category, not a status). Warm carries a character, and exactly one word if it is used - see *Colors*.
- **One tier per chip.** A chip reads at most one meaning; never weight a single chip with two statuses.
- **Saturation cap:** chips repeat across model and voice lists, so even repeated Signal badges on a single screen count inside the One-Signal rule as *one selected categorical slot*, not N competing actions. Use them sparingly and pair with an icon only inside the badge where density proves necessary.

### Inputs / Fields

- **Style:** Clean White fill, 1px Hairline border, Default radius (8px), 12px/16px (`3`/`4`) padding, Body (16/24) value in Ink. Placeholder text is Slate.
- **Docked to a screen edge:** a field pinned to the bottom of the screen is full-bleed — Clean White fill, radius 0, a 1px Hairline **top** border only (none on left, right or bottom), and no outer gutter, per *Layout*. Its value therefore sits 16px from the screen edge rather than 36px. See *Chat Messages* for the composer, the only such field.
- **Hover:** border steps to Hairline Strong.
- **Focus:** border steps to Signal Mark — 1px, not 2px, and no outer ring. The colour *is* the focus indicator; there is no glow and no halo. On native, pair the border change with the platform focus behaviour so keyboard and switch-control users get a visible state too.
- **Error:** 1px Alert Red Mark border, Alert Red helper text directly beneath the field (`8px` gap, Body Small). The field keeps its Clean White fill — it does not go red.
- **Labels:** field labels are Body Small in Slate, sitting `8px` above the field. Placeholder text is a *hint*, never a label substitute.
- **The composer is an input, not a custom control.** It is a multiline field with leading attach and companion/model picker controls, and trailing thinking, voice and send controls, using this same spec. It does not get its own visual language — with exactly one documented exception, the docked full-bleed variant above, which changes its fill, radius, border and inset but not its anatomy.

### Cards / Containers

- **Corner style:** Default radius (8px). X-Large (16px) only for modal cards.
- **Background:** Clean White on Cool Paper. Use Mist for a card that is *inside* another surface, never as a top-level card.
- **Shadow strategy:** none — see *Elevation & Depth*. Separation is the 1px Hairline border, always present on a card.
- **Border:** 1px Hairline, on all four sides — except a full-bleed element, whose left and right edges coincide with the screen edge and so take a top divider only (the composer is the only such element today). A card without a border is a mistake unless it is Mist-on-Mist.
- **Internal padding:** 24px (`6`) on all sides. 16px for a card that contains a list of rows rather than prose.
- **Row cards** (model list, session history) drop the internal padding to 0 and let a 16px horizontal / 12px vertical row padding define the rhythm, so the divider lines run edge to edge. Settings cards are the titled variant: they keep 16px internal padding and inset the dividers (see Settings).
- **Model cards** are the row-card case with one refinement, taken from PocketPal's `ModelCard` anatomy (see `docs/research/2026-10-10-model-card-architecture-parity.md`): a *header* block carries its own 16px horizontal padding, and then ONE content wrapper carries it again for everything below it — the warnings, the progress bar, the action row, and the expanded details when open. The action row and the details therefore carry no padding of their own, which is what lets the hairline-bearing header, the scrolled content and the expansion all share one left edge. The details are a continuation of that wrapper, not a second region: no `border-t` re-opens a divider inside the card, and the card's own 1px border is the only enclosure.
- **Recorded correction (2026-10-10).** The model card shipped for a while at PocketPal's 24px radius, taken wholesale over this step. It was the one card that had not been re-derived against the design system, and it is now 8px. The lesson is worth naming: *parity is a licence to copy anatomy, never a licence to copy a token.*

### Settings

A settings screen is a stack of **titled row cards** on Cool Paper, grouped by subject rather than by screen. This grouping came from PocketPal's Material 3 settings screen; it is rebuilt here in Uniwind against this file's tokens, and it borrows the *structure* only — no `react-native-paper`, no second design language, and nothing here overrides a rule above. Each card carries a `Card.Title`, copied from PocketPal's anatomy and rendered in our tokens.

- **Section:** one Clean White row card with a 1px Hairline border, Default radius, and 16px internal padding. Its title (`Card.Title`, 16/24 regular Ink) sits inside that padding, 8px above the first row. Sections are spaced 16px (`4`) apart.
- **Row:** 48–56px minimum, 12px vertical padding, no extra horizontal padding inside a titled card — the card's 16px inset is the row's inset, so dividers run from 16px to 16px, never around the card's outside edge.
- **Descriptions are load-bearing, not decorative.** A row adds a second line (Label 11/16 Slate) only when the label alone cannot tell the user the consequence: a consent disclosure, a cost or storage warning, an error, a device limitation, or a live value the control depends on. A bare label is correct for a self-evident toggle. **Recorded exception:** the Model Settings sheet, the one surface held to PocketPal's copy verbatim — its token rows are bare label+switch because the reference's are, and the rows that do need explaining (Reasoning, graded effort) carry PocketPal's own help text beneath them.
- **Controls sit right-aligned**; the label block takes the remaining width. A value that needs explaining beyond the description is a picker, not a wider label.
- **Trailing chevron means "this opens something."** A row that navigates carries one; a row that edits in place does not. The one exception is the Advanced group, which expands in place and so carries the chevron that says so. Chevrons are 2px stroke at 16px in Slate.
- **"Advanced" is a collapsed group by default** and renders as a full-width row at 14/20 Slate (`text-title`, matching PocketPal's `accordionTitle`), not the 11/16 Label rung, with a chevron that points right when closed and down when open. A screen with more than ~8 visible rows uses one; the tuning a power user wants is not what a first-run user should read past.
- **A row with no effect is a defect.** Every control here is wired to real behaviour. A toggle that does nothing is worse than a missing one.

### Navigation

- **Header (56px, Clean White, 1px Hairline bottom):** a leading control (menu or back), the wordmark in Screen title (600, 14/20) Ink, and trailing controls. Leading and trailing slots are **fixed width and equal** so the wordmark stays optically centred no matter how many trailing icons appear. Icons are 2px stroke at 20px in Ink; a header control that opens something live takes Signal.
- **Tab bar (67px + safe-area inset, Clean White, 1px Hairline top):** items are icon-over-label, 2px stroke icon at 24px, Label (11/14, pinned) label. Inactive is Slate. Active is Signal on both icon and label, and **colour is the only active signal** — no pill, no indicator bar. Exactly one tab is active.
- **The drawer has no title row.** Its panel opens straight onto the menu and history (pocketpal's sidebar has no header either); scrim, swipe and system back all close it. Recorded as Q5=A — our old row carried the wordmark and an X.
- **Colour is the whole active state.** The Surface Tint pill and the 2px indicator bar were removed: a square behind the icon read as a shape rather than a state. The 40x40 icon box stays because it is the touch target, not decoration.
- **Predictive Back and transitions.** Predictive Back is enabled so the system gesture animates the pop. The "transitions do not animate" rule governs the app's own JS navigator — tab and screen switches cut, and shared chrome (tab bar, composer) never moves. The OS back gesture is a platform affordance, not an app transition.
- **Nav chrome is static.** No fade, no slide, no scale on the bar itself — only the content behind it may transition.

### Chat Messages

The product's centre of gravity, and the one place the system is allowed to feel warm.

- **User message:** right-anchored, Surface Tint fill, Large radius (12px), Ink label at Body. Avatar circle on the outer edge. Capped at 75% of viewport width. Carries a timestamp and a delivery check in Caption Slate, outside the bubble.
- **Assistant message:** left-anchored, Clean White fill with a 1px Hairline border, Large radius. A **portrait avatar**, not a generic glyph — LiAI's identity is a character, and a robot icon would replace the brand with a category. Name and timestamp sit above the card in Caption Slate.
- **Action row (copy / replay / speak):** below the assistant card, 2px stroke icons at 16px in Slate, `12px` apart, no labels. Appears on a settled message, not a streaming one.
- **Tail corners:** one corner of each bubble takes Small radius (4px) — the corner facing the speaker's edge — so the two bubble types mirror each other. This is the only asymmetric radius in the system.
- **Message states**, each carrying an icon *and* a word so colour is never the only signal:
  - **Normal** — no indicator.
  - **Streaming** — a Signal dot trail, animated once per token, never looping while idle.
  - **Thinking** — a Slate dot trail with the word "Thinking" in Caption.
  - **Error** — an Alert Red Mark exclamation on an Alert Tint ground, with a retry affordance and the reason in Body Small.
- **Link previews** are Mist-filled cards at Default radius with a 1px Hairline border, a 48px square image at Small radius, a Body Small title, and the domain in Caption Slate. The domain is the only link-blue text permitted.
- **The composer is the field.** It sits pinned to the bottom edge to edge — full-bleed, Clean White, radius 0, a 1px Hairline top border — with **no Cool Paper bar behind it and no surrounding container**. It is a multiline input per the *Inputs / Fields* spec with leading attach and companion/model picker controls, and a trailing think pill, voice button and send icon button in its Primary state, disabled — Secondary, not dimmed — when the input is empty.
  - **Companion and model selection live in the composer.** The leading chevron opens one sheet with Companions and Models tabs, landing on Models; the chat header carries only the conversation title, model name and actions, never a companion button.
  - **Rows the field owns stack inside it** — the attach preview, the voice and attach issue lines — so the field's measured height is exactly what the message list reserves, and the newest message can never sit behind them.
  - **Chrome that is not part of the field floats above it** as overlays with their own fill — the sending indicator, the suggested-prompt chips, the usage line. Overlays are opaque, because they sit over message content rather than over a bar. They move with the field so the keyboard cannot strand them.
  - **With no model loaded** the field's placeholder says so, and nothing else does. There is deliberately **no in-composer prompt, banner or model-loading button** for it: the models screen is reached from the header wordmark and the picker, and the empty thread has its own card with a button. A prompt floating over the conversation is the thing this layout is built to avoid — it either covers the newest message or forces the list to reserve space for something that is not content.
  - The composer and the tab bar are both Clean White, so with the keyboard down they read as one white plane split by a hairline. That is intended, not a missing surface.

### AI States

Machine-in-the-loop feedback. These are the only places Coolant Cyan is allowed.

- **Listening:** a Surface Tint circle with concentric Signal rings, one 2px stroke icon at the centre. Rings expand once on entry and hold. The word "Listening" sits in Caption beneath.
- **Speaking:** a waveform of vertical bars, tinted a violet that the board shows but does not specify — **unresolved, see *Colors*.** Until it is settled, render it in Signal rather than inventing a fifth hue. The word "Speaking" in Caption beneath.
- **Thinking:** three Slate dots in sequence with the word "Thinking" in Caption.
- **Vision Active:** four Signal Blue corner brackets around the camera glyph, with a trailing dot animation. The brackets are drawn marks, not a border.
- **Every state pairs a glyph with a word.** A user who cannot distinguish the colours still knows what the app is doing.

### Feedback States

- **Loading:** a Signal spinner with the word "Loading" in Body Small Slate. Spinners are the only looping animation in the system, and they stop the moment there is a result.
- **Success:** a Jade check in a circle, with the confirmation word in Body ("Saved"). Jade never appears without the check.
- **Error:** an Alert Red Mark exclamation on an Alert Tint ground, a short plain-language sentence ("Something went wrong"), and a retry action. Never a stack trace, never an error code as the headline.
- **Empty state:** a soft glyph at 999px in Mist, a Title (20, 500) headline naming the situation ("No messages yet"), one Body Small Slate line naming the next move, and one primary button. An empty state always offers a way forward.

## Do's and Don'ts

### Do:

- **Do** let Signal Blue mark exactly one thing per screen. Scan any screen and count the blue elements; if the count exceeds one live/selected/actionable element, something is competing.
- **Do** separate with a 1px Hairline border or one step between Cool Paper, Clean White, and Mist. That is the whole depth model.- **Do** keep every value on the 4px spacing scale and every radius on the five-step scale — the sole exception being radius 0 on a full-bleed rectangle (the 999px circle form is a separate language, not a scale step). If a number is not on a scale, it does not ship.
- **Do** meet the accessibility floor on every screen: 4.5:1 text contrast, 48×48dp touch targets, 16px minimum body text and dynamic type support. Motion always plays at full PocketPal timing — the OS reduce-motion setting is deliberately not honoured. Contrast is machine-checked against the real token values (`jest/design-system.test.ts`); touch targets and the type floor are held in the BEM blocks in `global.css`, not at call sites.
- **Do** pair every status colour with a glyph and a word — check, exclamation, dot trail, word. Colour is never the only indicator. The one documented exception is the bottom tab bar, where the active tab is tint alone (see Navigation).
- **Do** use Coolant Cyan only for machine-in-the-loop states (thinking, vision, streaming) and Signal everywhere else.
- **Do** reach for a mask gradient only where it marks a truncation edge — one instance, the template preview. Never as a surface, a fill or a heading.
- **Do** treat "PocketPal parity" as structure and copy, never as Material components. Where the reference uses react-native-paper, this system supplies the native equivalent (a real `@expo/ui` switch seeded Signal Blue) or the nearest token from this file (`.input` for a filled Paper field). The reference's anatomy and words carry; its component library does not.
- **Do** keep nav chrome and the composer static. Only the content behind them transitions.
- **Do** apply safe-area insets exactly once per edge, at the component that owns that edge.
- **Do** use Inter, and gate first paint on the font resolving so nothing flashes in the system typeface.

### Don't:

- **Don't** reintroduce the retired v0 world: near-black surfaces (`#0B0C0C`), the lime accent (`#D8E87D`), Raleway, soft surface elevation, clipped octagonal corners, or emoji used as interface glyphs. That world is dead.
- **Don't** add a shadow, a glow, a blur, or a decorative gradient. There is no such token, and adding one means this file is out of date. The one exception is the mask gradient above, which is a truncation cue and paints nothing.
- **Don't** use a second typeface or a monospace exception. Inter carries code and metadata.
- **Don't** render text below Caption (12px), and don't drop reading text below Body Small (14px) to make a layout fit.
- **Don't** use colour as the only signal. Every *status* carries a glyph and a word. Selection state in platform-native navigation (the active bottom tab) is the exception, and it is tint alone.
- **Don't** let two status colours appear in one component. One component, one status.
- **Don't** tint a border, an icon, or a label. Tints are grounds for selected surfaces only.
- **Don't** dim a text colour with an alpha modifier, and don't grey out a disabled control with `opacity-N` — disabled is Mist fill + Slate label, per *Buttons*. Seven `text-secondary-text/70` sites once sat in this codebase, all of them 14px reading text at 3.59:1; the guard in `jest/design-system.test.ts` fails `npm test` on the pattern.
- **Don't** animate loopingly or decoratively, and don't exceed 300ms. State changes and feedback only; motion always plays (PocketPal parity — no reduce-motion branch).
- **Don't** animate the tab bar, the header, or the composer, and don't let the bar's height change under the user's thumb — a bar that shifts is a bug, not a transition.
- **Don't** invent a colour that isn't in this file. If a design needs one, add the token here first, with a reason.
