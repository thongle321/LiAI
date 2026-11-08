/** CompanionGenerationSettingsSheet — PocketPal's PalGenerationSettingsSheet
 *  contract, at the props seam.
 *
 *  What this locks is the part a companion can get wrong quietly: the sheet
 *  must show the values a turn will ACTUALLY run (the global preset under the
 *  companion's own overrides), and Save must hand back only the fields that
 *  differ from that preset — so an untouched form leaves the companion
 *  following the preset instead of pinning today's numbers against a future
 *  change.
 *
 *  The native Reset menu and sliders are replaced by stand-ins; the assertions
 *  read the values the rows carry and the three reset destinations' effects.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { CompanionGenerationSettingsSheet } from "../companion-generation-settings-sheet.tsx";
import { DEFAULT_SAMPLER, type SamplerParams } from "@/services/inference/sampler.ts";

const mockLoadGlobalPreset = jest.fn();

// DEVICE ONLY: services/chat/preset.ts reads expo-sqlite through a dynamic
// import, which Jest's CJS runtime cannot perform. The storage read is the
// service's job; what this sheet owes is resolving over whatever preset it is
// handed, so the preset is stubbed at that seam.
jest.mock("@/services/chat/preset.ts", () => ({
  loadGlobalPreset: () => mockLoadGlobalPreset(),
}));

// DEVICE ONLY: the real ResetMenu is a native SwiftUI/Compose menu. This
// stand-in renders its items as pressable labels so the three destinations can
// be exercised; what the native menu looks like is device territory.
jest.mock("../../reset-menu", () => {
  const React = require("react");
  const { Pressable, Text, View } = require("react-native");
  return {
    ResetMenu: ({
      items,
    }: {
      items: ReadonlyArray<{ label: string; onPress: () => void }>;
    }) =>
      React.createElement(
        View,
        null,
        items.map((item) =>
          React.createElement(
            Pressable,
            { key: item.label, onPress: item.onPress, accessibilityLabel: item.label },
            React.createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});

/** The two rows the assertions read. SliderRow names its typed field
 *  `<LABEL> value`, which is the only stable handle on a value. */
const temperatureInput = () => screen.getByLabelText("TEMPERATURE value");
const topKInput = () => screen.getByLabelText("TOP K value");

/** Render the sheet and let the preset promise settle, so the draft the
 *  assertions read is the one the sheet resolved rather than the placeholder
 *  it mounted with. */
async function openSheet({
  name = "Sage",
  base = null,
  onSave = jest.fn(),
  onClose = jest.fn(),
}: {
  name?: string;
  base?: Partial<SamplerParams> | null;
  onSave?: jest.Mock;
  onClose?: jest.Mock;
} = {}) {
  render(
    <CompanionGenerationSettingsSheet
      visible
      name={name}
      base={base}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  await act(async () => {});
  return { onSave, onClose };
}

/** Seed the global preset the companion layers over. */
function withPreset(overrides: Partial<SamplerParams>): void {
  mockLoadGlobalPreset.mockResolvedValue({ ...DEFAULT_SAMPLER, ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadGlobalPreset.mockResolvedValue(DEFAULT_SAMPLER);
});

describe("CompanionGenerationSettingsSheet presentation", () => {
  it("names the companion in the title", async () => {
    await openSheet({ name: "Sage" });

    expect(screen.getByText("Generation Settings - Sage")).toBeTruthy();
  });

  it("says the companion inherits the preset when it has no overrides", async () => {
    await openSheet({ name: "Sage", base: null });

    expect(screen.getByText("Inherited settings for Sage")).toBeTruthy();
  });

  it("says the companion has its own settings when it overrides the preset", async () => {
    await openSheet({ name: "Sage", base: { temperature: 0.9 } });

    expect(screen.getByText("Custom settings for Sage")).toBeTruthy();
  });

  it("omits JINJA, a global engine flag rather than a per-companion one", async () => {
    await openSheet();

    expect(screen.queryByText("JINJA")).toBeNull();
  });
});

describe("CompanionGenerationSettingsSheet values", () => {
  it("shows the global preset under the companion's overrides, not the built-in defaults", async () => {
    withPreset({ temperature: 0.5 });
    await openSheet({ base: { topK: 20 } });

    await waitFor(() => expect(temperatureInput().props.value).toBe("0.50"));
    expect(topKInput().props.value).toBe("20");
  });
});

describe("CompanionGenerationSettingsSheet reset", () => {
  it("puts the preset back in the form without saving", async () => {
    withPreset({ temperature: 0.5 });
    const { onSave } = await openSheet({ base: null });

    fireEvent.changeText(temperatureInput(), "1.5");
    fireEvent(temperatureInput(), "endEditing");
    expect(temperatureInput().props.value).toBe("1.50");

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Reset to Global Defaults"));
    });

    expect(temperatureInput().props.value).toBe("0.50");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves nothing after a reset back to the preset", async () => {
    withPreset({ temperature: 0.5 });
    const { onSave } = await openSheet({ base: null });

    fireEvent.changeText(temperatureInput(), "1.5");
    fireEvent(temperatureInput(), "endEditing");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Reset to Global Defaults"));
    });
    fireEvent.press(screen.getByLabelText("Save"));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("puts the built-in defaults back in the form, not the preset", async () => {
    withPreset({ temperature: 0.5 });
    await openSheet({ base: null });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Reset to System Defaults"));
    });

    expect(temperatureInput().props.value).toBe("0.70");
  });

  it("clears the companion's override immediately", async () => {
    withPreset({ temperature: 0.5 });
    const { onSave } = await openSheet({ base: { temperature: 0.9 } });

    fireEvent.press(screen.getByLabelText("Clear Companion Settings"));

    expect(onSave).toHaveBeenCalledWith(null);
  });
});

describe("CompanionGenerationSettingsSheet save", () => {
  it("keeps the companion following the preset when nothing was changed", async () => {
    withPreset({ temperature: 0.5 });
    const { onSave } = await openSheet({ base: null });

    await waitFor(() => expect(temperatureInput().props.value).toBe("0.50"));
    fireEvent.press(screen.getByLabelText("Save"));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("stores only the field the user changed, measured against the preset", async () => {
    withPreset({ temperature: 0.5 });
    const { onSave } = await openSheet({ base: null });

    await waitFor(() => expect(temperatureInput().props.value).toBe("0.50"));
    fireEvent.changeText(temperatureInput(), "0.9");
    fireEvent(temperatureInput(), "endEditing");
    fireEvent.press(screen.getByLabelText("Save"));

    expect(onSave).toHaveBeenCalledWith({ temperature: 0.9 });
  });
});
