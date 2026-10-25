/** The voice screen's Phonon card follows the store's offering gate
 *  (parity item 2, #1009 — PocketPal's VoicePickerView filters
 *  `ENGINE_ORDER.filter(isEngineOffered)`): an unsupported probe hides the
 *  card entirely, a supported one shows it. Registered tests read the
 *  mock's DEFAULT (`supported: false`), so the unsupported case is the
 *  baseline and the supported case is seeded.
 */

import { render, screen } from "@testing-library/react-native";

import { VoiceSettings } from "../voice-settings.tsx";
import { useVoice } from "@/store/voice.ts";

const PHONON_HEADER = /^Phonon — /;

describe("voice settings Phonon gating", () => {
  it("hides the Phonon card when the add-on probe says unsupported", async () => {
    render(<VoiceSettings />);
    await screen.findByLabelText(/^Kitten — /);

    // The mock's getEngineSupport resolves `{supported: false}` and the
    // screen's load() reconciled it — the card is the visible surface.
    expect(screen.queryByLabelText(PHONON_HEADER)).toBeNull();
  });

  it("shows the Phonon card when the engine is supported", async () => {
    useVoice.setState({ phononSupported: true });

    render(<VoiceSettings />);
    await screen.findByLabelText(PHONON_HEADER);

    expect(screen.queryByLabelText(PHONON_HEADER)).toBeTruthy();
  });
});
