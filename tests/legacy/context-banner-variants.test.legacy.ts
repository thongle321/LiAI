/** The five context-banner variants and their precedence (ticket 05).
 * Run: node --test tests/context-banner-variants.test.ts
 *
 * Two blocks, as in context-fill.test.ts: the resolver is pure and is
 * exercised directly against real inputs; the chat wiring is pinned by
 * reading the screen as TEXT, so no react-native import is needed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTOCLEAR_RUNWAY,
  ESCALATED_AFTER_FAILURES,
  HTML_SOFT_CAP_COUNT,
  MIN_REMOTE_TOKENS,
  WARNING_THRESHOLD,
  type BannerInput,
  type BannerSnapshot,
  type BannerVariant,
  contextFullCopy,
  consecutiveFullFailures,
  dismissBanner,
  endsWithTerminalPunctuation,
  isRemoteCutOff,
  resolveBannerVariant,
} from "../lib/chat/banner-variant.ts";

const input = (over: Partial<BannerInput> = {}): BannerInput => ({
  windowSize: 4096,
  isRemote: false,
  modelLoaded: true,
  htmlPreviewCount: 0,
  dismissed: new Set<BannerVariant>(),
  ...over,
});

describe("carried-over constants", () => {
  it("keeps PocketPal's numbers", () => {
    assert.equal(WARNING_THRESHOLD, 0.8);
    assert.equal(AUTOCLEAR_RUNWAY, 256);
    assert.equal(MIN_REMOTE_TOKENS, 500);
    assert.equal(HTML_SOFT_CAP_COUNT, 4);
    assert.equal(ESCALATED_AFTER_FAILURES, 2);
  });
});

describe("endsWithTerminalPunctuation", () => {
  it("reads a finished sentence as finished", () => {
    assert.equal(endsWithTerminalPunctuation("All done."), true);
    assert.equal(endsWithTerminalPunctuation("Really?"), true);
    assert.equal(endsWithTerminalPunctuation("Wow!"), true);
  });

  it("covers the full-width sentence-ending forms", () => {
    assert.equal(endsWithTerminalPunctuation("就是这样。"), true);
    assert.equal(endsWithTerminalPunctuation("真的？"), true);
    assert.equal(endsWithTerminalPunctuation("太好了！"), true);
  });

  it("sees through a closing quote or bracket, and trailing space", () => {
    assert.equal(endsWithTerminalPunctuation('He said "done."'), true);
    assert.equal(endsWithTerminalPunctuation("(finished.)"), true);
    assert.equal(endsWithTerminalPunctuation('"done。"  '), true);
  });

  it("reads a mid-sentence stop as no stop at all", () => {
    assert.equal(endsWithTerminalPunctuation("the third item is"), false);
    assert.equal(endsWithTerminalPunctuation("ends with a comma,"), false);
    assert.equal(endsWithTerminalPunctuation("..."), true); // ends on a period
    assert.equal(endsWithTerminalPunctuation("code: `a.b`"), false);
  });

  it("never invents a stop from an empty reply", () => {
    assert.equal(endsWithTerminalPunctuation(undefined), false);
    assert.equal(endsWithTerminalPunctuation(""), false);
    assert.equal(endsWithTerminalPunctuation("   "), false);
  });
});

describe("isRemoteCutOff", () => {
  const turn = { isRemote: true, completionTokens: 900, content: "and then it" };

  it("fires only when all four conditions hold", () => {
    assert.equal(isRemoteCutOff(turn), true);
  });

  it("needs remote origin", () => {
    assert.equal(isRemoteCutOff({ ...turn, isRemote: false }), false);
  });

  it("stays silent on a length stop — a declared cut is not a mystery cut", () => {
    assert.equal(isRemoteCutOff({ ...turn, stoppedEarly: true }), false);
  });

  it("fires at the minimum token count, not below it", () => {
    assert.equal(
      isRemoteCutOff({ ...turn, completionTokens: MIN_REMOTE_TOKENS - 1 }),
      false,
    );
    assert.equal(
      isRemoteCutOff({ ...turn, completionTokens: MIN_REMOTE_TOKENS }),
      true,
    );
  });

  it("reads an unreported token count as too short, never as eligible", () => {
    assert.equal(
      isRemoteCutOff({ ...turn, completionTokens: undefined }),
      false,
    );
  });

  it("stays silent when the reply ends properly", () => {
    assert.equal(isRemoteCutOff({ ...turn, content: "and then it." }), false);
  });
});

describe("consecutiveFullFailures", () => {
  it("counts the full failures back from the newest turn", () => {
    assert.equal(
      consecutiveFullFailures([{}, { contextFull: true }, { contextFull: true }]),
      2,
    );
  });

  it("is reset by ANY successful turn", () => {
    assert.equal(consecutiveFullFailures([{ contextFull: true }, {}]), 0);
    assert.equal(consecutiveFullFailures([{ contextFull: true }, { contextFull: true }, {}]), 0);
  });

  it("reads zero for an empty or all-successful history", () => {
    assert.equal(consecutiveFullFailures([]), 0);
    assert.equal(consecutiveFullFailures([{}, {}]), 0);
  });
});

describe("contextFullCopy", () => {
  it("prefers remote outright — a remote model has no in-app context control", () => {
    assert.equal(
      contextFullCopy({
        isRemote: true,
        heavyToolName: "render_html",
        consecutiveFullFailures: 5,
      }),
      "remote",
    );
  });

  it("then names the heavy tool", () => {
    assert.equal(
      contextFullCopy({ isRemote: false, heavyToolName: "render_html", consecutiveFullFailures: 5 }),
      "heavy-tool",
    );
  });

  it("then escalates after the threshold", () => {
    assert.equal(contextFullCopy({ isRemote: false, consecutiveFullFailures: 1 }), "default");
    assert.equal(contextFullCopy({ isRemote: false, consecutiveFullFailures: 2 }), "escalated");
    assert.equal(contextFullCopy({ isRemote: false, consecutiveFullFailures: 9 }), "escalated");
  });

  it("falls back to the default", () => {
    assert.equal(contextFullCopy({ isRemote: false }), "default");
  });
});

describe("resolveBannerVariant", () => {
  const full: BannerSnapshot = { contextFull: true, promptTokens: 4096 };
  const warn: BannerSnapshot = { promptTokens: 3300 };

  it("shows context-full, carrying its copy and ratio", () => {
    const r = resolveBannerVariant(full, input({ consecutiveFullFailures: 3 }));
    assert.equal(r.variant, "context-full");
    assert.equal(r.copy, "escalated");
    assert.equal(r.ratio, 1);
  });

  it("shows the near-limit warning below the full threshold", () => {
    const r = resolveBannerVariant(warn, input());
    assert.equal(r.variant, "context-warning");
    assert.equal(r.ratio, 3300 / 4096);
  });

  it("keeps the full banner above the warning", () => {
    const r = resolveBannerVariant({ contextFull: true, promptTokens: 4000 }, input());
    assert.equal(r.variant, "context-full");
  });

  it("auto-clears the full banner once occupancy drops out of the runway", () => {
    const used = 4096 - AUTOCLEAR_RUNWAY - 1;
    const r = resolveBannerVariant({ contextFull: true, promptTokens: used }, input());
    // Out of the runway the full banner clears itself, and the warning
    // deliberately excludes a context-full turn — so the slot goes empty
    // until a turn actually recovers. Nothing stale is left standing.
    assert.equal(r.variant, "none");
  });

  it("keeps the full banner exactly at the runway edge", () => {
    const r = resolveBannerVariant(
      { contextFull: true, promptTokens: 4096 - AUTOCLEAR_RUNWAY },
      input(),
    );
    assert.equal(r.variant, "context-full");
  });

  it("shows the remote cut-off notice where no window figure exists", () => {
    // A remote window is known only once /props lands, and this branch
    // must not wait for it.
    const r = resolveBannerVariant(
      { completionTokens: 900, content: "and then it" },
      input({ isRemote: true, windowSize: undefined }),
    );
    assert.equal(r.variant, "remote-cut-off");
  });

  it("shows the HTML soft cap at four previews and below it nothing", () => {
    assert.equal(
      resolveBannerVariant(undefined, input({ htmlPreviewCount: HTML_SOFT_CAP_COUNT })).variant,
      "html-soft-cap",
    );
    assert.equal(
      resolveBannerVariant(undefined, input({ htmlPreviewCount: HTML_SOFT_CAP_COUNT - 1 })).variant,
      "none",
    );
  });

  it("resolves the soft cap with NO model loaded — it reads no model state", () => {
    const r = resolveBannerVariant(
      undefined,
      input({ htmlPreviewCount: 4, modelLoaded: false, windowSize: undefined }),
    );
    assert.equal(r.variant, "html-soft-cap");
  });

  it("holds the nCtx variants back until a model is loaded", () => {
    assert.equal(resolveBannerVariant(full, input({ modelLoaded: false })).variant, "none");
    assert.equal(resolveBannerVariant(warn, input({ modelLoaded: false })).variant, "none");
    assert.equal(
      resolveBannerVariant(
        { completionTokens: 900, content: "and then it" },
        input({ isRemote: true, modelLoaded: false }),
      ).variant,
      "none",
    );
  });

  it("never warns or fills blind on an unknown window", () => {
    assert.equal(resolveBannerVariant(full, input({ windowSize: undefined })).variant, "none");
    assert.equal(resolveBannerVariant(warn, input({ windowSize: undefined })).variant, "none");
    assert.equal(resolveBannerVariant({ contextFull: true }, input()).variant, "none");
  });

  it("honours the precedence order", () => {
    const everything: BannerInput = input({
      isRemote: true,
      htmlPreviewCount: 4,
      consecutiveFullFailures: 4,
      heavyToolName: "render_html",
    });
    // full > warning
    assert.equal(
      resolveBannerVariant({ contextFull: true, promptTokens: 4096 }, everything).variant,
      "context-full",
    );
    // warning > cut-off
    assert.equal(
      resolveBannerVariant(
        { promptTokens: 3300, completionTokens: 900, content: "and then it" },
        everything,
      ).variant,
      "context-warning",
    );
    // cut-off > soft cap
    assert.equal(
      resolveBannerVariant(
        { completionTokens: 900, content: "and then it" },
        everything,
      ).variant,
      "remote-cut-off",
    );
    // soft cap > none
    assert.equal(resolveBannerVariant(undefined, everything).variant, "html-soft-cap");
  });

  it("clamps the ratio into a meter that cannot read nonsense", () => {
    assert.equal(resolveBannerVariant({ promptTokens: 99999 }, input()).ratio, 1);
  });

  it("stays silent when nothing is wrong", () => {
    assert.equal(resolveBannerVariant({ promptTokens: 100 }, input()).variant, "none");
    assert.equal(resolveBannerVariant(undefined, input()).variant, "none");
  });
});

describe("dismissals", () => {
  it("hides the dismissed variant and nothing else", () => {
    const dismissed = dismissBanner(new Set<BannerVariant>(), "context-full");
    assert.equal(
      resolveBannerVariant({ contextFull: true, promptTokens: 4096 }, input({ dismissed })).variant,
      "none",
    );
    assert.equal(
      resolveBannerVariant({ promptTokens: 3300 }, input({ dismissed })).variant,
      "context-warning",
    );
  });

  it("does not mutate the set it was given", () => {
    const before = new Set<BannerVariant>();
    dismissBanner(before, "context-warning");
    assert.equal(before.size, 0);
  });

  it("lasts exactly one turn: the next recorded turn clears the set", () => {
    // Clearing is a fresh empty set — the session keeps no history of
    // what was read, so the next occurrence speaks again.
    const dismissed = dismissBanner(new Set<BannerVariant>(), "context-full");
    const afterTurn = new Set<BannerVariant>();
    assert.equal(
      resolveBannerVariant(
        { contextFull: true, promptTokens: 4096 },
        input({ dismissed: afterTurn }),
      ).variant,
      "context-full",
    );
    assert.ok(dismissed.has("context-full"));
  });

  it("lets the dismissed soft cap be replaced by nothing at all", () => {
    // The soft cap has no dismissal gate in the resolver, matching
    // PocketPal: it is a standing hint, not a per-turn notice.
    const dismissed = dismissBanner(new Set<BannerVariant>(), "html-soft-cap");
    assert.equal(
      resolveBannerVariant(undefined, input({ htmlPreviewCount: 4, dismissed })).variant,
      "html-soft-cap",
    );
  });
});

describe("chat wiring", () => {
  const chat = readFileSync("app/(drawer)/(tabs)/chat.tsx", "utf8");

  it("renders every variant from the ONE resolver in the existing slot", () => {
    assert.match(chat, /resolveBannerVariant\(/, "the screen resolves, it does not re-derive");
    assert.equal(
      (chat.match(/<ContextFullBanner/g) ?? []).length,
      1,
      "one slot — a variant must not grow a second mount",
    );
  });

  it("keeps the banner out of the message list", () => {
    const listStart = chat.indexOf("<MessageList");
    const banner = chat.indexOf("<ContextFullBanner");
    assert.ok(listStart > -1 && banner > listStart);
    // The banner lives in the overlay row that follows the list element.
    const listEnd = chat.indexOf("/>", listStart);
    assert.ok(banner > listEnd, "the banner mounts after the list closes, not inside it");
  });

  it("counts HTML previews from the conversation's tool steps", () => {
    assert.match(chat, /htmlPreviewCount|countHtmlPreviews/, "the count comes from the turns");
  });
});