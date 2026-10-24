/** voiceMemoryFit contract, ported from pocketpal-ai's memoryFit tests onto
 *  LiAI's DeviceMemory (total RAM × platform share — no iOS free-before-load
 *  ceiling exists on this stack; see the research note). */

import { ASR_TIERS } from "@/services/asr/constants.ts";
import type { AsrTier } from "@/services/asr/types.ts";
import {
  memoryBudget,
  voiceMemoryFit,
  whisperFits,
  type DeviceMemory,
} from "@/services/voice/memory-fit.ts";

const sttBytes = ASR_TIERS.base.runtimeBytes;
// LiAI has no MEASURED engine RAM; a fake nonzero keeps the row auditable.
const ttsBytes = 80_000_000;
const android = (totalBytes: number): DeviceMemory => ({ os: "android", totalBytes });
const ios = (totalBytes: number): DeviceMemory => ({ os: "ios", totalBytes });

describe("memoryBudget", () => {
  it("is total RAM × the per-platform share", () => {
    expect(memoryBudget(android(7.4e9))).toBe(7.4e9 * 0.45);
    expect(memoryBudget(ios(7.4e9))).toBe(7.4e9 * 0.8);
  });
});

describe("whisperFits", () => {
  it("is chat + whisper against the budget; unreadable memory fits", () => {
    expect(whisperFits(android(7.4e9), 3.01e9, sttBytes)).toBe(false);
    expect(whisperFits(android(7.4e9), 1e9, sttBytes)).toBe(true);
    expect(whisperFits(ios(7.4e9), 5.5e9, sttBytes)).toBe(true);
    expect(whisperFits(ios(7.4e9), 5.9e9, sttBytes)).toBe(false); // 5.9+0.33 > 0.8×7.4
    expect(whisperFits({ os: "android", totalBytes: null }, 9e9, sttBytes)).toBe(true);
  });
});

describe("voiceMemoryFit", () => {
  it("won't fit a 3.23 GB chat model on a 7.4 GB Android phone", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 3.23e9,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("wont_fit");
  });

  it("fits a 1.4 GB chat model on the same phone, with the full breakdown", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("fits");
    expect(fit.breakdown).toEqual({
      rows: [
        { kind: "chat", bytes: 1.4e9 },
        { kind: "stt", bytes: sttBytes },
        { kind: "tts", bytes: ttsBytes },
      ],
      neededBytes: 1.4e9 + sttBytes + ttsBytes,
      availableBytes: 7.4e9 * 0.45,
    });
  });

  it("is tight when whisper fits but the whole cascade does not", () => {
    const budget = 7.4e9 * 0.45;
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: budget - sttBytes - ttsBytes / 2,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("tight");
  });

  it("budgets against the iOS share", () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 2e9,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("fits");
    expect(fit.breakdown.availableBytes).toBe(4e9 * 0.8);
    expect(fit.breakdown.neededBytes).toBe(2e9 + sttBytes + ttsBytes);
  });

  it("is tight on iOS when whisper fits but the voice does not", () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 * 0.8 - sttBytes - ttsBytes / 2,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("tight");
  });

  it("on iOS won't fit when whisper alone passes the budget", () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 * 0.8 - sttBytes + 1,
      sttTier: "base",
      ttsBytes,
    });
    expect(fit.status).toBe("wont_fit");
  });

  it("counts the given tier and names it on the fit", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttTier: "small",
      ttsBytes,
    });
    expect(fit.sttTier).toBe("small");
    expect(fit.breakdown.rows).toContainEqual({
      kind: "stt",
      bytes: 650_000_000,
    });
  });

  it("omits the tts row when the bytes are unknown (LiAI: unmeasured)", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttTier: "base",
      ttsBytes: 0,
    });
    expect(fit.breakdown.rows.map((r) => r.kind)).toEqual(["chat", "stt"]);
  });

  it("fits when memory could not be read, still naming the tier", () => {
    const fit: ReturnType<typeof voiceMemoryFit> = voiceMemoryFit({
      memory: { os: "android", totalBytes: null },
      chatBytes: 9e9,
      sttTier: "large-turbo",
      ttsBytes,
    });
    expect(fit.status).toBe("fits");
    expect(fit.sttTier).toBe("large-turbo");
  });

  it("won't fit exactly where dictation refuses whisper", () => {
    const cases: Array<[DeviceMemory, number]> = [
      [android(7.4e9), 3.23e9],
      [android(7.4e9), 1.4e9],
      [android(4e9), 1.5e9],
      [ios(4e9), 3.9e9],
      [ios(4e9), 2e9],
    ];
    const tierBytes = (tier: AsrTier): number => ASR_TIERS[tier].runtimeBytes;
    void tierBytes;
    for (const [memory, chatBytes] of cases) {
      const fit = voiceMemoryFit({
        memory,
        chatBytes,
        sttTier: "base",
        ttsBytes,
      });
      expect(fit.status === "wont_fit").toBe(
        !whisperFits(memory, chatBytes, sttBytes),
      );
    }
  });
});
