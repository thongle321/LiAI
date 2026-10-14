/** HTML preview: the wrapping boundary and the render_html talent.
 *
 * Two things are load-bearing and both are pure, so both are pinned here:
 *
 *  1. `wrapDocument` MUST emit the CSP on every branch. A branch that
 *     quietly dropped the policy would render model-authored markup with no
 *     sandbox at all — the one failure the whole file exists to prevent.
 *  2. The talent's `content` is what the MODEL reads, and it must NOT be
 *     the html echoed back: the model wrote it, so an echo only burns
 *     context. The html reaches the renderer through `data` alone.
 *
 * The WebView itself is device-only (like lib/chat/share-export.ts) and is
 * not asserted here; its config is pinned by source in
 * tests/html-preview-bubble.test.ts.
 *
 * Run: node --test tests/html-preview.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PREVIEW_CSP,
  wrapDocument,
} from "../lib/html/preview-document.ts";
import {
  runTalent,
  talentDefinitions,
  type TalentContext,
} from "../lib/agent/registry.ts";

const ctx: TalentContext = {
  fetchImpl: fetch,
  search: null,
};

describe("wrapDocument", () => {
  it("injects the CSP into a full document that already has a head", () => {
    const out = wrapDocument(
      "<!DOCTYPE html><html><head><title>x</title></head><body><p>hi</p></body></html>",
    );
    assert.ok(out.includes(PREVIEW_CSP), "the policy survives the author's head");
    // The author's own head content is not discarded — injection, not
    // replacement.
    assert.ok(out.includes("<title>x</title>"));
    assert.ok(out.includes("<p>hi</p>"));
  });

  it("synthesizes a head when the document declares <html> without one", () => {
    const out = wrapDocument("<html><body><p>hi</p></body></html>");
    assert.ok(out.includes(PREVIEW_CSP));
    assert.ok(out.includes("<p>hi</p>"));
  });

  it("wraps a bare fragment in a whole document, policy included", () => {
    const out = wrapDocument("<p>hi</p>");
    assert.ok(out.startsWith("<!DOCTYPE html>"));
    assert.ok(out.includes(PREVIEW_CSP));
    assert.ok(out.includes("<p>hi</p>"));
  });

  it("emits the policy for EVERY input shape", () => {
    // The property that matters, stated as a property rather than as three
    // cases: whatever the model wrote, the loaded document carries the CSP.
    for (const input of [
      "",
      "   ",
      "<p>fragment</p>",
      "<html><head></head><body></body></html>",
      "<html><body></body></html>",
      "<!DOCTYPE html><html><head><meta charset='utf-8'></head></html>",
      "not html at all <<<",
      "<HTML><BODY><P>upper</P></BODY></HTML>",
    ]) {
      assert.ok(
        wrapDocument(input).includes(PREVIEW_CSP),
        `no CSP for input: ${JSON.stringify(input)}`,
      );
    }
  });

  it("locks the origin down: default-src none, data: images only", () => {
    // If either part loosened, model-authored markup could phone home.
    assert.match(PREVIEW_CSP, /default-src 'none'/);
    assert.match(PREVIEW_CSP, /img-src data:/);
    assert.match(PREVIEW_CSP, /font-src data:/);
    assert.doesNotMatch(PREVIEW_CSP, /default-src[^;]*https?:/);
  });
});

describe("render_html talent", () => {
  it("is advertised with html required", () => {
    const def = talentDefinitions().find(
      (d) => d.function.name === "render_html",
    );
    assert.ok(def, "the tool is offered to the model");
    // ToolDefinition.parameters is Record<string, unknown>, so the schema
    // shape is narrowed here rather than asserted through `any`.
    const params = def.function.parameters as {
      required?: string[];
      properties?: Record<string, { type?: string }>;
    };
    assert.deepEqual(params.required, ["html"]);
    assert.equal(params.properties?.html?.type, "string");
    assert.equal(
      params.properties?.title?.type,
      "string",
      "title stays optional",
    );
  });

  it("passes the html to the RENDERER, never to the model", async () => {
    const html = "<h1>Report</h1>";
    const out = await runTalent(
      "render_html",
      JSON.stringify({ html, title: "Report" }),
      ctx,
    );
    assert.equal(out.ok, true);
    assert.equal(out.data?.html, html, "the renderer gets the markup");
    assert.equal(out.data?.title, "Report");
    // The model sees only the fixed success summary.
    assert.ok(
      !out.content.includes("Report"),
      `model-facing content echoed the html: ${out.content}`,
    );
    assert.match(out.content, /rendered into a preview/);
  });

  it("omits the title key when the model did not send one", async () => {
    const out = await runTalent("render_html", JSON.stringify({ html: "<p>x</p>" }), ctx);
    assert.equal(out.ok, true);
    assert.equal("title" in (out.data ?? {}), false);
  });

  it("fails when html is missing or empty", async () => {
    for (const args of [{}, { html: "" }, { html: 42 }]) {
      const out = await runTalent("render_html", JSON.stringify(args), ctx);
      assert.equal(out.ok, false, `should fail for ${JSON.stringify(args)}`);
      assert.match(out.content, /missing or empty "html" argument/);
    }
  });
});