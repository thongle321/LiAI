/** The bottom tab bar's destinations.
 *
 *  Vision is NOT a destination anymore: the voice tab owns it as an
 *  in-screen mode behind the Eye toggle, so the bar must render exactly
 *  Chat and Voice. This suite pins that contract — the component test
 *  lives beside the subject (`components/**` gets a __tests__ folder;
 *  route-level suites stay in jest/).
 */

import { render, screen } from "@testing-library/react-native";

import { BottomNav } from "../bottom-nav.tsx";

describe("BottomNav", () => {
  it("renders Chat and Voice only — no Vision destination", () => {
    render(<BottomNav active="chat" onSelect={(): void => {}} />);
    expect(screen.getByLabelText("Chat")).toBeOnTheScreen();
    expect(screen.getByLabelText("Voice")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Vision")).not.toBeOnTheScreen();
  });
});
