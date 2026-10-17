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

/** Kokoro, not installed — its body is the install CTA. */
function seedNotInstalled(): void {
  useVoice.setState({
    // The device-default voice belongs to no engine, so every engine card
    // starts collapsed — the state the regression shipped in.
    currentVoice: DEVICE_DEFAULT_VOICE,
    activeEngineId: null,
    downloads: { ...EMPTY_DOWNLOADS, kokoro: { state: "not_installed", percent: 0 } },
  });
}

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
