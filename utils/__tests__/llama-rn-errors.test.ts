import { LLAMARN_ERROR_PATTERNS } from "../llama-rn-errors.ts";

describe("LLAMARN_ERROR_PATTERNS", () => {
  it("matches context is full, case-insensitively and as a substring", () => {
    expect(LLAMARN_ERROR_PATTERNS.contextFull.test("Context is full")).toBe(true);
    expect(LLAMARN_ERROR_PATTERNS.contextFull.test("context is full")).toBe(true);
    expect(LLAMARN_ERROR_PATTERNS.contextFull.test("CONTEXT IS FULL")).toBe(true);
    expect(
      LLAMARN_ERROR_PATTERNS.contextFull.test("Context is full in some other text"),
    ).toBe(true);
    expect(LLAMARN_ERROR_PATTERNS.contextFull.test("Not an error")).toBe(false);
  });

  it("matches the speculative draft-context allocation failure", () => {
    expect(
      LLAMARN_ERROR_PATTERNS.speculativeInit.test("Failed to create draft context"),
    ).toBe(true);
    expect(
      LLAMARN_ERROR_PATTERNS.speculativeInit.test(
        "failed to create draft context for speculative decoding",
      ),
    ).toBe(true);
    expect(
      LLAMARN_ERROR_PATTERNS.speculativeInit.test("Not a speculative init error"),
    ).toBe(false);
  });

  it("matches the truncated tool-call parser error", () => {
    expect(
      LLAMARN_ERROR_PATTERNS.toolArgsParse.test(
        "Failed to parse tool call arguments as JSON",
      ),
    ).toBe(true);
    expect(
      LLAMARN_ERROR_PATTERNS.toolArgsParse.test(
        "some prefix Failed to parse tool call arguments as JSON",
      ),
    ).toBe(true);
    expect(LLAMARN_ERROR_PATTERNS.toolArgsParse.test("Not a parse error")).toBe(
      false,
    );
  });
});
