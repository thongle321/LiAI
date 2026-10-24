/** The ASR settings tier rows (components/voice/asr-setup.tsx's TierRow).
 *
 *  #1017's selection policy, at the surface: switching to an INSTALLED
 *  tier calls the store's public `selectTier` (the ready-gated switch —
 *  the internal `setSelectedTier` write is NOT what a row press goes
 *  through); a never-installed row is inert as a selector; names and
 *  hints come from utils/asr-tier-label.ts (the shared copy the sheets
 *  use too).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AsrSetup } from "../asr-setup.tsx";
import { useAsrStore } from "@/store/asr.ts";
import { ASR_TIER_LABEL, ASR_TIER_HINT } from "@/utils/asr-tier-label.ts";

// These tests pin ROW behavior, not the singleton store's reconcile (that
// lives in store/__tests__/asr-store.test.ts, with injected deps): a real
// load() would hit its dynamic-import seams, which Jest's CJS VM cannot
// execute. Everything else (selection, rows) rides real state.
function stubLoad(): void {
  useAsrStore.setState({ load: async () => {} } as never);
}

function renderSetup(): void {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <AsrSetup />
    </SafeAreaProvider>,
  );
}

describe("AsrSetup tier rows", () => {
  beforeEach(() => {
    stubLoad();
  });

  it("rows carry the shared tier name and hint", () => {
    useAsrStore.setState({
      asrAvailable: true,
      downloadStates: {
        base: "ready",
        small: "not_installed",
        "large-turbo": "not_installed",
      } as never,
    } as never);
    renderSetup();

    expect(screen.getByText(ASR_TIER_LABEL.base)).toBeOnTheScreen();
    expect(screen.getByText(ASR_TIER_LABEL.small)).toBeOnTheScreen();
    expect(screen.getByText(ASR_TIER_LABEL["large-turbo"])).toBeOnTheScreen();
    expect(
      screen.getAllByText(new RegExp(`^${ASR_TIER_HINT.base} · `)).length,
    ).toBeGreaterThan(0);
  });

  it("pressing an installed tier switches through selectTier", () => {
    useAsrStore.setState({
      asrAvailable: true,
      selectedTier: "base",
      isSelectedTierReady: true,
      downloadStates: {
        base: "ready",
        small: "ready",
        "large-turbo": "not_installed",
      } as never,
    } as never);
    const selectTier = jest.fn();
    useAsrStore.setState({ selectTier: selectTier as never });
    renderSetup();

    fireEvent.press(screen.getByTestId("asr-tier-small"));
    expect(selectTier).toHaveBeenCalledWith("small");
  });

  it("a never-installed row cannot be selected", () => {
    useAsrStore.setState({
      asrAvailable: true,
      selectedTier: "base",
      isSelectedTierReady: true,
      downloadStates: {
        base: "ready",
        small: "not_installed",
        "large-turbo": "not_installed",
      } as never,
    } as never);
    const selectTier = jest.fn();
    useAsrStore.setState({ selectTier: selectTier as never });
    renderSetup();

    const row = screen.getByTestId("asr-tier-small");
    expect(row.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(row);
    expect(selectTier).not.toHaveBeenCalled();
  });
});
