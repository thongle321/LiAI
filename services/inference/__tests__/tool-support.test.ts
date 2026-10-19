/** Tool-support probe: the jinja caps decide, and "could not tell" stays
 *  distinct from "no tool support" (PocketPal parity). */

import { hasToolSupport } from "../tool-support";
import type { ToolSupportProbe } from "../tool-support";

type Jinja = NonNullable<
  NonNullable<ToolSupportProbe["model"]>["chatTemplates"]
>["jinja"];

function ctx(jinja: Jinja): ToolSupportProbe {
  return { model: { chatTemplates: { jinja } } };
}

describe("hasToolSupport", () => {
  it("reports no support when the default template has no tool caps", () => {
    expect(
      hasToolSupport(
        ctx({ defaultCaps: { tools: false, toolCalls: false }, toolUse: false }),
      ),
    ).toBe(false);
  });

  it("reports support when the default template supports tools", () => {
    expect(
      hasToolSupport(
        ctx({ defaultCaps: { tools: true, toolCalls: false }, toolUse: false }),
      ),
    ).toBe(true);
  });

  it("reports support when the default template supports tool calls", () => {
    expect(
      hasToolSupport(
        ctx({ defaultCaps: { tools: false, toolCalls: true }, toolUse: false }),
      ),
    ).toBe(true);
  });

  it("reports support when the tool_use variant validates", () => {
    expect(
      hasToolSupport(
        ctx({ defaultCaps: { tools: false, toolCalls: false }, toolUse: true }),
      ),
    ).toBe(true);
  });

  it("reports support when the tool_use variant's caps say so", () => {
    expect(
      hasToolSupport(
        ctx({
          defaultCaps: { tools: false, toolCalls: false },
          toolUse: false,
          toolUseCaps: { tools: true, toolCalls: false },
        }),
      ),
    ).toBe(true);
  });

  it("reports no support when the tool_use variant exists but caps nothing", () => {
    expect(
      hasToolSupport(
        ctx({
          defaultCaps: { tools: false, toolCalls: false },
          toolUse: false,
          toolUseCaps: { tools: false, toolCalls: false },
        }),
      ),
    ).toBe(false);
  });

  it("treats a jinja block with no caps at all as no support", () => {
    expect(hasToolSupport(ctx({}))).toBe(false);
  });

  it("treats a model with no jinja block as no support", () => {
    expect(hasToolSupport({ model: { chatTemplates: {} } })).toBe(false);
  });

  it("cannot tell when the context carries no model at all", () => {
    expect(hasToolSupport({})).toBeUndefined();
  });
});
