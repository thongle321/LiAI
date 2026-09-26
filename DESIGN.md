---
name: LiAI
description: A calm mind. A smarter everyday.
colors:
  signal-blue: "#3882F6"
  deep-signal: "#2563EB"
  coolant-cyan: "#06B6D4"
  surface-tint: "#EFF6FF"
  jade: "#10B981"
  amber: "#F59E0B"
  alert-red: "#EF4444"
  cool-paper: "#F8FAFC"
  clean-white: "#FFFFFF"
  mist: "#F1F5F9"
  hairline: "#E2E8F0"
  hairline-strong: "#CBD5E1"
  ink: "#0F172A"
  slate: "#64748B"
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
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.clean-white}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-solid-hover:
    backgroundColor: "{colors.deep-signal}"
  button-outline:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.signal-blue}"
    rounded: "{rounded.default}"
    padding: "10px 20px"
    typography: "{typography.body}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal-blue}"
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
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.clean-white}"
    rounded: "999px"
    size: "40px"
  icon-button-secondary:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.signal-blue}"
    rounded: "999px"
    size: "40px"
  input-default:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.default}"
    padding: "12px 16px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.clean-white}"
    rounded: "{rounded.default}"
    padding: "20px"
  card-muted:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.default}"
    padding: "20px"
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
    height: "64px"
  tab-active:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.signal-blue}"
    rounded: "{rounded.large}"
    size: "40px"
  ai-listening:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.signal-blue}"
    rounded: "999px"
    size: "56px"
---

# Design System: LiAI

## Overview

**Creative North Star: "The Quiet Instrument"**

> *Inferred, not confirmed.* You declined the North Star and voice questions, so this is derived from the board's own words — the tagline "A calm mind. A smarter everyday." and the stated intent "a subtle sci-fi aesthetic that feels advanced, not overwhelming… Realistic, not overly stylized." Rename it freely; nothing downstream depends on the specific words.

LiAI is a light system with exactly one loud thing in it. A single blue (`#3882F6`) does all the signalling — the live tab, the focused field, the one primary action, the active step — and everything else is a near-white plane separated by 1px hairlines. The restraint is the point. Where most AI products reach for gradients, glass, and glow to feel futuristic, this one earns "sci-fi" from 2px line icons, corner brackets, and a dot trail. Nothing emits light.

The density is conversational, not dashboard. Space is generous — a 4px scale with a 20px screen gutter and 20px card padding — because a phone screen held one-handed for conversation should breathe. Structure comes from alignment and hairlines, never from enclosure: cards are open white rectangles, not boxes. Type does the heavy lifting, with a six-step Inter scale where Display (32/40) is reserved for one moment per screen and Caption (12/16) is the floor.

**This file is the authority, and the code is behind it.** The current build implements a retired v0 world — a near-black dystopian palette with a lime `#D8E87D` accent, Raleway, soft surface elevation, and clipped octagonal panel corners. Every one of those is a rejected direction. See *Do's and Don'ts*.

**Key Characteristics:**

- **One signal.** Signal Blue marks exactly one live, selected, or actionable element per screen. Never two.
- **No shadows, no glow, no gradients.** Depth is a 1px hairline (`#E2E8F0`) or a single step between three near-white surfaces.
- **Inter only.** Six sizes, three weights (400/500/600). Nothing renders below 12px.
- **4px grid, no exceptions.** Every margin, padding, and gap is a multiple of 4.
- **Flat rectangles.** The only circles are things you press (icon buttons, avatars) and things that listen (the mic).
- **The retired world.** Near-black surfaces, lime accents, Raleway, octagonal clipped corners, and emoji glyphs are all out.

## Colors

A light, cool-neutral palette built from three near-white planes and one confident blue.

### Primary

- **Signal Blue** (`#3882F6`): the system's only voice. It marks the one thing that is live, selected, focused, or primary-actionable on any screen — the active tab, the focused input border, the solid button, the running tool step, the send arrow. Because it is the only saturated colour in normal use, its scarcity is what makes it read as a signal.
- **Deep Signal** (`#2563EB`): the hover and pressed state of Signal Blue, and the correct choice for a solid button's `:active`. It is a darker step of the same hue, not a second colour. Use it to make an already-blue element feel pressed; never introduce it as an independent accent.

### Secondary

- **Coolant Cyan** (`#06B6D4`): the secondary hue, reserved for **machine-in-the-loop moments** — the Thinking and Vision Active states, streaming indicators, and anything where the *system* (not the user) is the actor. It never styles a user-reachable control. If a component could plausibly use either blue, it uses Signal Blue.

### Status

- **Jade** (`#10B981`): success and completion only. Pairs with a check glyph — never colour alone.
- **Amber** (`#F59E0B`): warning and degraded states: a paused download, a missing permission, a slow connection.
- **Alert Red** (`#EF4444`): error and destructive action. Destructive *buttons* take a solid fill; inline error text takes the colour on a Clean White or Cool Paper ground, never on a tint.

### Neutral

- **Cool Paper** (`#F8FAFC`): the app background and the outermost plane. Every screen starts here.
- **Clean White** (`#FFFFFF`): the raised plane — cards, inputs, headers, the tab bar. This is the system's only "lift", and it is a value step, not a shadow.
- **Mist** (`#F1F5F9`): the recessed plane. Tracks, disabled fills, inactive chips, and any surface that sits *inside* something else rather than on top of the page.
- **Hairline** (`#E2E8F0`): the default 1px border. The workhorse separator.
- **Hairline Strong** (`#CBD5E1`): a hovered or emphasised border. Use to answer "is this row tappable?" without lifting it.
- **Ink** (`#0F172A`): all body and heading text. Primary text is always Ink, never a muted grey.
- **Slate** (`#64748B`): secondary text only — timestamps, hints, counts, placeholders, unit labels. Slate is never used for a heading and never for a control label.
- **Scrim** (`rgba(15, 23, 42, 0.6)`): modal and sheet backdrops.

### Tints

Two tints exist, and they exist for a specific reason: a selected element needs a ground to sit on.

- **Surface Tint** (`#EFF6FF`): the 50-step of Signal Blue's own hue. It is the fill of the user's message bubble, the assistant message card, the active tab pill, and the Listening ring. It is a *ground*, never a border, an icon colour, or a text colour.
- **Alert Tint** (`rgba(239, 68, 68, 0.12)`): Alert Red at 12% over Clean White. The fill of destructive icon buttons and error chips.

> **Unresolved.** The board shows a green-tinted success card, a red-tinted error card, and a violet-tinted Speaking waveform, but its palette panel does not specify those three values. They are deliberately absent here rather than invented. Derive them the same way as the two tints above (a low-alpha step of the documented status hue) and add them as tokens when you settle them — do not let each component pick its own.

### Named Rules

**The One Signal Rule.** Signal Blue marks exactly one thing per screen — the single live, selected, or actionable element. If a second element needs blue, one of them is wrong.

**The Tint Rule.** Tints are grounds for a selected element, nothing else. No tinted border, no tinted icon, no tinted text. If you want a selected element to read as selected, tint the surface it sits on and leave the border Hairline.

**The Scrim Rule.** Backdrops are near-black at 60% (`rgba(15, 23, 42, 0.6)`) and never take a hue. A tinted scrim turns a system dialog into a product statement.

**The Ink-and-Slate Rule.** Text is Ink or Slate, never blue, never a status colour, and never a third grey. Status colour lives in the icon or the surface, not in the sentence.

## Typography

**Display Font:** Inter
**Body Font:** Inter
**Label/Mono Font:** none — Inter carries metadata, labels, and code. There is no monospace family and no second typeface.

**Character:** A single geometric grotesque doing every job, from 32px down to 12px. The personality comes from the weight and colour steps — Semibold headings in Ink, Regular body in Ink, Regular metadata in Slate — not from mixing families. Inter is specified with a fallback of any similar modern sans-serif; on native, load it through `expo-font` and gate first paint on the font resolving, so nothing flashes in the system typeface.

### Hierarchy

- **Display** (600, 32/40): one per screen at most. Onboarding welcome, the "You're set" confirmation, the About wordmark. Never inside a list, a card, or a chat bubble.
- **Headline** (600, 24/32): screen titles on pushed routes and the empty-state headline. A screen gets one.
- **Title** (20, 500 Medium): card and section titles, modal titles, the assistant name in a message header. This is the most-used step after Body.
- **Body** (400, 16/24): all reading text. Chat messages, descriptions, button labels, input values. On a 390pt-wide phone a full-width Body measure runs 34–40 characters; assistant bubbles cap at roughly 75% of viewport width so the line never exceeds that comfortable reading measure.
- **Body Small** (400, 14/20): supporting text that is read but not acted on — field hints, empty-state descriptions, author bylines, link-preview descriptions.
- **Caption** (400, 12/16): metadata only — timestamps, token counts, status labels, quantisation chips, download speeds. It is the floor; nothing is smaller.

### Named Rules

**The 16px Floor Rule.** Reading text is Body (16/24) by default and never smaller than Body Small (14/20). Reaching for Caption to fit more words onto a line is a layout failure, not a type decision.

**The Single Family Rule.** One family, three weights. A second typeface or a monospace exception must be added to this file first, with a reason.

**The Caption Means Metadata Rule.** Caption labels things that happened or things that are counted — a time, a token total, a file size, a state name. It never carries a sentence a user is expected to act on.

## Layout

The spatial model is a 4px scale — 4, 8, 12, 16, 20, 24, 32, 40, 48 — with **no off-scale values**. On Uniwind/Tailwind this scale is already the default (`p-1` through `p-12`), so no custom spacing configuration is needed; the discipline is in *choosing* from it, not in defining it.

**Gutters and padding.** The screen gutter is one `5` step (20px) on every edge, including horizontal insets for cards, list rows, and form fields. Cards carry 20px (`5`) internal padding — generous, because a card is a small plane, not a dense module. Fields sit at 12px/16px (`3`/`4`) vertical/horizontal. Message bubbles sit at 12px/16px (`3`/`4`).

**Vertical rhythm.** Between a section heading and its first row: 8px (`2`). Between a heading block and the section below it: 24px (`6`). Icon-to-label inside a row: 8px (`2`) for icon buttons, 10–12px for the larger row icons. Never let a gap be a value you cannot name on the scale.

**Containers.** Surfaces are full-bleed or inset by the gutter; there is no centred max-width column. Chat is the one exception to horizontal rhythm — message bubbles are edge-anchored (user right, assistant left) and capped at roughly 75% of viewport width, because a chat reads as a column of alternating edges, not a stack of equal cards.

**Navigation geometry.** The header is 56px tall, sits on Clean White with a 1px Hairline bottom border, and holds a leading control, the wordmark, and trailing controls in fixed-width slots so the wordmark stays optically centred regardless of how many trailing icons are present. The tab bar is 64px plus the device's bottom safe-area inset, with a 1px Hairline top border; the inset is applied once, at the bar, and screens opt out of it rather than double-applying it.

**Density.** Fixed-format rows (settings, model lists, session history) are 44–52px tall — the accessibility floor is 44×44dp for every touch target, and a denser row is not worth the tradeoff. Prose surfaces (chat, empty states) are looser and centred.

**Responsive behaviour.** Portrait is the design target (`orientation: portrait` in app config). On tablets, the layout must not stretch: cap content columns at a comfortable reading measure and centre them in the viewport rather than letting cards span full width. Safe-area insets are applied exactly once per edge by whichever component owns that edge.

## Elevation & Depth

**This system uses no shadows.** There is no `box-shadow`, no `elevation`, no blur, and no glow anywhere in the product. Depth is communicated two ways only:

1. **Hairline borders.** A 1px line in Hairline (`#E2E8F0`) separates nearly everything. Hover steps it to Hairline Strong (`#CBD5E1`); focus steps it to Signal Blue (`#3882F6`).
2. **Surface value steps.** Three near-white planes stack in a fixed order: Cool Paper (`#F8FAFC`) is the page, Clean White (`#FFFFFF`) is the raised element, Mist (`#F1F5F9`) is the recessed element. A card is white on paper. A track inside a card is mist on white. That is the entire depth model.

Modals and sheets add a third, separate layer: the Scrim (`rgba(15, 23, 42, 0.6)`) over everything, with the sheet itself on Clean White.

### Named Rules

**The Hairline Rule.** Every separation is a 1px line or a single surface step. If a design needs a drop shadow to be legible, the border is too light or the surface step is missing — fix that instead of adding depth.

**The No-Glow Rule.** Nothing emits light. No shadow, no inner glow, no coloured blur, no neon. Sci-fi is signalled by geometry — 2px line icons, corner brackets, dot trails — not by luminance.

**The Three-Plane Rule.** Only three surface values exist. A fourth is a bug: either something is raised (Clean White) or recessed (Mist), and nothing is both.

## Shapes

Corners are soft but never round. The radius scale has five named steps and they are chosen **by role**, never by eye:

- **Micro** (2px): the inner radius of small filled controls — a 20px checkbox, a 4px progress fill, the active tab indicator.
- **Small** (4px): dense inline elements — chips, badges, code spans, tags.
- **Default** (8px): the workhorse. Buttons, inputs, cards, dropdown menus, list containers. Most of the system sits here.
- **Large** (12px): message bubbles, segmented controls, sheets, prominent icon-button wells.
- **X-Large** (16px): modal cards and the largest single surfaces. Reserve it — if everything is x-large, nothing is.

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
- **Solid (primary):** Signal Blue fill, Clean White label. **The default choice.** One per screen.
- **Solid hover/pressed:** Deep Signal (`#2563EB`) fill on hover; Deep Signal plus a 2% scale-down on press.
- **Outline (secondary):** Clean White fill, 1px Signal Blue border, Signal Blue label. Hover steps the border to Deep Signal. Use for the second action of equal importance.
- **Ghost (tertiary):** transparent fill, no border, Signal Blue label. Use for the third-and-beyond action, and for destructive-adjacent actions that should not compete with a solid red.
- **Destructive:** Alert Red fill, Clean White label. Reserved for irreversible actions — delete, wipe, revoke. If a screen has both a solid primary and a destructive action, the destructive one is Outline with an Alert Red border and label, not a second solid.
- **Disabled:** Mist fill, Slate label, no border, no shadow. Disabled is a *fill and label* change, never opacity on a live element — the element must still be legible enough to be found.

### Icon Buttons

- **Shape:** Fully circular (999px), 40px (`10`) diameter, 2px stroke icon centred at 20px.
- **Primary:** Signal Blue fill, Clean White icon. Reserve for the single most important action in a surface — the send arrow, the primary add.
- **Secondary:** Surface Tint fill, Signal Blue icon. The default for every other icon-only control.
- **Destructive:** Alert Tint fill, Alert Red icon.
- **Touch target:** the visual circle is 40px; the touch target is 44×44dp minimum. Pad the hit area, not the circle.
- **Every icon-only button carries an accessibility label.** No exceptions, including destructive and decorative-adjacent controls.

### Inputs / Fields

- **Style:** Clean White fill, 1px Hairline border, Default radius (8px), 12px/16px (`3`/`4`) padding, Body (16/24) value in Ink. Placeholder text is Slate.
- **Hover:** border steps to Hairline Strong.
- **Focus:** border steps to Signal Blue — 1px, not 2px, and no outer ring. The colour *is* the focus indicator; there is no glow and no halo. On native, pair the border change with the platform focus behaviour so keyboard and switch-control users get a visible state too.
- **Error:** 1px Alert Red border, Alert Red helper text directly beneath the field (`8px` gap, Body Small). The field keeps its Clean White fill — it does not go red.
- **Labels:** field labels are Body Small in Slate, sitting `8px` above the field. Placeholder text is a *hint*, never a label substitute.
- **The composer is an input, not a custom control.** It is a multiline field with a trailing send icon button, using this same spec. It does not get its own visual language.

### Cards / Containers

- **Corner style:** Default radius (8px). X-Large (16px) only for modal cards.
- **Background:** Clean White on Cool Paper. Use Mist for a card that is *inside* another surface, never as a top-level card.
- **Shadow strategy:** none — see *Elevation & Depth*. Separation is the 1px Hairline border, always present on a card.
- **Border:** 1px Hairline, on all four sides. A card without a border is a mistake unless it is Mist-on-Mist.
- **Internal padding:** 20px (`5`) on all sides. 16px for a card that contains a list of rows rather than prose.
- **Row cards** (settings, model list, session history) drop the internal padding to 0 and let a 16px horizontal / 12px vertical row padding define the rhythm, so the divider lines run edge to edge.

### Navigation

- **Header (56px, Clean White, 1px Hairline bottom):** a leading control (menu or back), the wordmark in Headline (600, 24/32) Ink, and trailing controls. Leading and trailing slots are **fixed width and equal** so the wordmark stays optically centred no matter how many trailing icons appear. Icons are 2px stroke at 20px in Ink; a header control that opens something live takes Signal Blue.
- **Tab bar (64px + safe-area inset, Clean White, 1px Hairline top):** items are icon-over-label, 2px stroke icon at 24px, Caption label. Inactive is Slate. Active is Signal Blue on both icon and label, sitting on a Surface Tint pill (Large radius) with a 2px Signal Blue indicator bar above the label. Exactly one tab is active.
- **The active pill is always mounted.** Swap its fill and its indicator's opacity; do not mount and unmount it. Mounting on selection changes the row's height and makes the whole bar jump.
- **Screen transitions do not animate.** Pushed and popped routes cut. The tab bar and composer are shared chrome that must never move underneath the user.
- **Nav chrome is static.** No fade, no slide, no scale on the bar itself — only the content behind it may transition.

### Chat Messages

The product's centre of gravity, and the one place the system is allowed to feel warm.

- **User message:** right-anchored, Surface Tint fill, Large radius (12px), Ink label at Body. Avatar circle on the outer edge. Capped at 75% of viewport width. Carries a timestamp and a delivery check in Caption Slate, outside the bubble.
- **Assistant message:** left-anchored, Clean White fill with a 1px Hairline border, Large radius. A **portrait avatar**, not a generic glyph — LiAI's identity is a character, and a robot icon would replace the brand with a category. Name and timestamp sit above the card in Caption Slate.
- **Action row (copy / replay / speak):** below the assistant card, 2px stroke icons at 16px in Slate, `12px` apart, no labels. Appears on a settled message, not a streaming one.
- **Tail corners:** one corner of each bubble takes Small radius (4px) — the corner facing the speaker's edge — so the two bubble types mirror each other. This is the only asymmetric radius in the system.
- **Message states**, each carrying an icon *and* a word so colour is never the only signal:
  - **Normal** — no indicator.
  - **Streaming** — a Signal Blue dot trail, animated once per token, never looping while idle.
  - **Thinking** — a Slate dot trail with the word "Thinking" in Caption.
  - **Error** — an Alert Red exclamation on an Alert Tint ground, with a retry affordance and the reason in Body Small.
- **Link previews** are Mist-filled cards at Default radius with a 1px Hairline border, a 48px square image at Small radius, a Body Small title, and the domain in Caption Slate. The domain is the only link-blue text permitted.
- **The composer** sits pinned to the bottom on Cool Paper with a 1px Hairline top border: a multiline input per the *Inputs / Fields* spec, a leading attach control, and a trailing send icon button in its Primary state. It is disabled — Secondary, not dimmed — when the input is empty.

### AI States

Machine-in-the-loop feedback. These are the only places Coolant Cyan is allowed.

- **Listening:** a Surface Tint circle with concentric Signal Blue rings, one 2px stroke icon at the centre. Rings expand once on entry and hold. The word "Listening" sits in Caption beneath.
- **Speaking:** a waveform of vertical bars, tinted a violet that the board shows but does not specify — **unresolved, see *Colors*.** Until it is settled, render it in Signal Blue rather than inventing a fifth hue. The word "Speaking" in Caption beneath.
- **Thinking:** three Slate dots in sequence with the word "Thinking" in Caption.
- **Vision Active:** four Signal Blue corner brackets around the camera glyph, with a trailing dot animation. The brackets are drawn marks, not a border.
- **Every state pairs a glyph with a word.** A user who cannot distinguish the colours still knows what the app is doing.

### Feedback States

- **Loading:** a Signal Blue spinner with the word "Loading" in Body Small Slate. Spinners are the only looping animation in the system, and they stop the moment there is a result.
- **Success:** a Jade check in a circle, with the confirmation word in Body ("Saved"). Jade never appears without the check.
- **Error:** an Alert Red exclamation on an Alert Tint ground, a short plain-language sentence ("Something went wrong"), and a retry action. Never a stack trace, never an error code as the headline.
- **Empty state:** a soft glyph at 999px in Mist, a Title (20, 500) headline naming the situation ("No messages yet"), one Body Small Slate line naming the next move, and one primary button. An empty state always offers a way forward.

## Do's and Don'ts

### Do:

- **Do** let Signal Blue mark exactly one thing per screen. Scan any screen and count the blue elements; if the count exceeds one live/selected/actionable element, something is competing.
- **Do** separate with a 1px Hairline border or one step between Cool Paper, Clean White, and Mist. That is the whole depth model.
- **Do** keep every value on the 4px spacing scale and every radius on the five-step scale. If a number is not on a scale, it does not ship.
- **Do** meet the accessibility floor on every screen: 4.5:1 text contrast, 44×44dp touch targets, 16px minimum body text, dynamic type support, and reduced-motion honoured.
- **Do** pair every status colour with a glyph and a word — check, exclamation, dot trail, word. Colour is never the only indicator.
- **Do** use Coolant Cyan only for machine-in-the-loop states (thinking, vision, streaming) and Signal Blue everywhere else.
- **Do** keep nav chrome and the composer static. Only the content behind them transitions.
- **Do** apply safe-area insets exactly once per edge, at the component that owns that edge.
- **Do** use Inter, and gate first paint on the font resolving so nothing flashes in the system typeface.

### Don't:

- **Don't** reintroduce the retired v0 world: near-black surfaces (`#0B0C0C`), the lime accent (`#D8E87D`), Raleway, soft surface elevation, clipped octagonal corners, or emoji used as interface glyphs. That world is dead.
- **Don't** add a shadow, a glow, a blur, or a decorative gradient. There is no such token, and adding one means this file is out of date.
- **Don't** use a second typeface or a monospace exception. Inter carries code and metadata.
- **Don't** render text below Caption (12px), and don't drop reading text below Body Small (14px) to make a layout fit.
- **Don't** use colour as the only signal. Every state carries a glyph and a word.
- **Don't** let two status colours appear in one component. One component, one status.
- **Don't** tint a border, an icon, or a label. Tints are grounds for selected surfaces only.
- **Don't** animate loopingly or decoratively, and don't exceed 300ms. State changes and feedback only; honour the reduced-motion system setting by collapsing durations to zero.
- **Don't** animate the tab bar, the header, or the composer, and don't mount/unmount the active tab indicator — a bar that changes height under the user's thumb is a bug, not a transition.
- **Don't** invent a colour that isn't in this file. If a design needs one, add the token here first, with a reason.
