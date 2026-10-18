/**
 * The engine card is a disclosure (spec Q12): the header is the toggle and
 * the body carries every action, so a collapsed card has to hide the body
 * entirely.
 *
 * This regressed once. The body rendered unconditionally — `expanded` drove
 * only the chevron and the a11y state — so tapping the header flipped the
 * glyph and left the card open. These pin the behaviour through the visible
 * surface alone: the header's own label, and the install affordance the body
 * puts on screen.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";

import { EngineCard } from "../engine-card.tsx";
import type { TtsModelStatus } from "@/services/tts/download.ts";
import { DEVICE_DEFAULT_VOICE } from "@/services/tts/types.ts";
import { EMPTY_DOWNLOADS, useVoice } from "@/store/voice.ts";

/** The install CTA exists only while the body is open. Matched loosely: the
 *  size in the label is measured data and moves with the archive. */
const INSTALL_KOKORO = /^Install the Kokoro/;

/** Same for a voice row — the other body branch, for a ready model. */
const VOICE_ROW = /^Speak with /;

/** The header is the only disclosure control on the card. */
function header(): ReturnType<typeof screen.getByLabelText> {
  return screen.getByLabelText(/^Kokoro — /);
}

/** What the header tells a screen reader about itself. */
function reportedExpanded(): boolean | undefined {
  return header().props.accessibilityState?.expanded;
}

/** Kokoro in one named state. `phase` is what separates a live transfer from
 *  an unpack, and they are the two states this card draws differently. */
function seedKokoro(status: TtsModelStatus): void {
  useVoice.setState({
    // The device-default voice belongs to no engine, so every engine card
    // starts collapsed — the state the regression shipped in.
    currentVoice: DEVICE_DEFAULT_VOICE,
    // The single-slot runtime points at whoever is downloading.
    activeEngineId: status.state === "downloading" ? "kokoro" : null,
    downloads: { ...EMPTY_DOWNLOADS, kokoro: status },
  });
}

/** Kokoro, not installed — its body is the install CTA. */
function seedNotInstalled(): void {
  seedKokoro({ state: "not_installed", percent: 0 });
}

/** Kokoro mid-download — the state whose progress copy lives in the body,
 *  which a collapsed card does not render. */
function seedDownloading(percent: number): void {
  seedKokoro({ state: "downloading", percent });
}

/** Kokoro paused mid-transfer — has a percent, but no work in flight. */
function seedPaused(percent: number): void {
  seedKokoro({ state: "paused", percent });
}

/** The ring around the header glyph. Decorative, so it carries a testID and
 *  not a label — nothing announces it. */
const RING = "engine-card-ring";

describe("EngineCard disclosure", () => {
  it("hides the body while collapsed", () => {
    seedNotInstalled();
    render(<EngineCard engineId="kokoro" />);

    expect(screen.queryByLabelText(INSTALL_KOKORO)).toBeNull();
    expect(reportedExpanded()).toBe(false);
  });

  it("opens the body on a header press", () => {
    seedNotInstalled();
    render(<EngineCard engineId="kokoro" />);

    fireEvent.press(header());

    expect(screen.getByLabelText(INSTALL_KOKORO)).toBeTruthy();
    expect(reportedExpanded()).toBe(true);
  });

  it("closes the body again on a second press", () => {
    seedNotInstalled();
    render(<EngineCard engineId="kokoro" />);

    fireEvent.press(header());
    fireEvent.press(header());

    expect(screen.queryByLabelText(INSTALL_KOKORO)).toBeNull();
    expect(reportedExpanded()).toBe(false);
  });

  /** The ready body is a different branch of the card, so it gets its own
   *  collapse check — a guard that hid only the install CTA would still
   *  leave every voice row permanently on screen. */
  it("hides the voice rows of a ready engine while collapsed", () => {
    useVoice.setState({
      currentVoice: DEVICE_DEFAULT_VOICE,
      activeEngineId: null,
      downloads: { ...EMPTY_DOWNLOADS, kokoro: { state: "ready", percent: 100 } },
    });
    render(<EngineCard engineId="kokoro" />);

    expect(screen.queryByLabelText(VOICE_ROW)).toBeNull();

    fireEvent.press(header());

    expect(screen.getAllByLabelText(VOICE_ROW).length).toBeGreaterThan(0);
  });
});

/** The body owns the progress copy, and the body is gone while the card is
 *  closed — so the header has to carry progress of its own, as PocketPal's
 *  does (VoicePickerView passes `ringProgress` to EngineLogo). */
describe("EngineCard download ring", () => {
  it("shows progress on the collapsed header while downloading", () => {
    seedDownloading(42);
    render(<EngineCard engineId="kokoro" />);

    expect(screen.queryByLabelText(INSTALL_KOKORO)).toBeNull();
    expect(screen.getByTestId(RING)).toBeTruthy();
  });

  it("shows no ring when nothing is downloading", () => {
    seedNotInstalled();
    render(<EngineCard engineId="kokoro" />);

    expect(screen.queryByTestId(RING)).toBeNull();
  });

  /** Paused is the near-miss: it has a percent, but the reference draws the
   *  ring for the live download only, so a frozen arc never implies work. */
  /** The percent restarts near 0 once unpacking begins, so an arc here would
   *  visibly rewind. Same reason the body refuses to draw a bar. */
  it("shows no ring while extracting", () => {
    seedKokoro({ state: "downloading", percent: 40, phase: "extracting" });
    render(<EngineCard engineId="kokoro" />);

    expect(screen.queryByTestId(RING)).toBeNull();
  });

  /** Progress has to reach the geometry, not just mount a ring. Read against
   *  the rendered dasharray rather than a recomputed circumference, so this
   *  cannot pass by restating the formula. */
  it("draws the arc from the transfer's percent", () => {
    seedDownloading(0);
    const first = render(<EngineCard engineId="kokoro" />);
    const empty = first.getByTestId(RING);
    const circumference = Number.parseFloat(empty.props.strokeDasharray);
    expect(empty.props.strokeDashoffset).toBe(circumference);

    first.unmount();

    seedDownloading(50);
    const second = render(<EngineCard engineId="kokoro" />);
    expect(second.getByTestId(RING).props.strokeDashoffset).toBe(circumference / 2);
  });
});
