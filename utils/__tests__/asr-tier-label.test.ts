/** PocketParity's asrTierLabel/asrTierHint contract: the copy table is
 *  complete and stable, so a tier can never render without its name. */

import {
  ASR_TIER_HINT,
  ASR_TIER_LABEL,
} from "@/utils/asr-tier-label.ts";

describe("tier copy (PocketParity tier* strings)", () => {
  it("names every tier", () => {
    expect(ASR_TIER_LABEL.base).toBe("Base");
    expect(ASR_TIER_LABEL.small).toBe("Small");
    expect(ASR_TIER_LABEL["large-turbo"]).toBe("Large Turbo");
  });

  it("hints every tier (base is the default, fast)", () => {
    expect(ASR_TIER_HINT.base).toBe("Default, fast");
    expect(ASR_TIER_HINT.small).toBe("More accurate, slower. Better for other languages");
    expect(ASR_TIER_HINT["large-turbo"]).toBe("Very slow on most phones");
  });
});
