/** The editor's talent list shows a human-readable label + description
 *  instead of the raw registry name. PocketPal's TalentSection does this
 *  by iterating the talent registry.
 */

import {
  talentLabel,
  talentDescription,
} from "@/services/companions/talent-display.ts";

describe("talentLabel", () => {
  it("maps registry names to the reference's label", () => {
    expect(talentLabel("datetime")).toBe("Date & Time");
    expect(talentLabel("calculate")).toBe("Calculator");
    expect(talentLabel("web_search")).toBe("Web Search");
    expect(talentLabel("read_url")).toBe("Read URL");
    expect(talentLabel("render_html")).toBe("Render HTML");
  });

  it("falls back to a readable version for unknown names", () => {
    expect(talentLabel("unknown_tool")).toBe("Unknown Tool");
  });
});

describe("talentDescription", () => {
  it("returns the tool definition's description for known talents", () => {
    expect(talentDescription("datetime")).toContain("current local date and time");
    expect(talentDescription("calculate")).toContain("mathematical expression");
    expect(talentDescription("web_search")).toContain("Search the web");
    expect(talentDescription("read_url")).toContain("Fetch the full text");
    expect(talentDescription("render_html")).toContain("HTML");
  });

  it("returns empty string for unknown talents", () => {
    expect(talentDescription("unknown")).toBe("");
  });
});