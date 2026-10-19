/** Draft-only detection: a draft model is not a chat model.
 *
 * The rule that matters: the GGUF header wins. A filename convention may
 * decide for a model we have not downloaded yet, but it must never
 * overrule a header that says "this is a chat model" — "openassistant-…"
 * is a real chat family, and a substring match would misfile it. */

import {
  isDraftOnlyArch,
  isDraftOnlyFilename,
  isDraftOnlySpec,
} from "../draft-only";

describe("isDraftOnlyArch", () => {
  it("recognises the draft architectures", () => {
    expect(isDraftOnlyArch("qwen3-mtp")).toBe(true);
    expect(isDraftOnlyArch("deepseek2-assistant")).toBe(true);
    expect(isDraftOnlyArch("gpt-oss_mtp")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDraftOnlyArch("Qwen3-MTP")).toBe(true);
    expect(isDraftOnlyArch("gemma4-assistant")).toBe(true);
  });

  it("needs a separator before the suffix word", () => {
    // The architecture is "<family>-assistant" / "<family>-mtp"; a bare
    // "assistant" is not an architecture llama.cpp writes.
    expect(isDraftOnlyArch("Assistant")).toBe(false);
  });

  it("leaves an ordinary chat architecture alone", () => {
    expect(isDraftOnlyArch("llama")).toBe(false);
    expect(isDraftOnlyArch("qwen3")).toBe(false);
    expect(isDraftOnlyArch("qwen3moe")).toBe(false);
  });

  it("only matches at the END of the architecture", () => {
    // "mtp" in the middle is a family name, not a draft suffix.
    expect(isDraftOnlyArch("mtp-llama")).toBe(false);
  });

  it("treats no architecture as not a draft", () => {
    expect(isDraftOnlyArch(undefined)).toBe(false);
    expect(isDraftOnlyArch("")).toBe(false);
  });
});

describe("isDraftOnlyFilename", () => {
  it("recognises the mtp prefix", () => {
    expect(isDraftOnlyFilename("MTP-UD-Q4_K_M.gguf")).toBe(true);
    expect(isDraftOnlyFilename("mtp-model.gguf")).toBe(true);
  });

  it("recognises assistant as a WHOLE token", () => {
    expect(isDraftOnlyFilename("model-assistant.gguf")).toBe(true);
    expect(isDraftOnlyFilename("model_assistant.gguf")).toBe(true);
    expect(isDraftOnlyFilename("assistant.gguf")).toBe(true);
    expect(isDraftOnlyFilename("model.assistant.2.gguf")).toBe(true);
  });

  it("does not mistake a chat model that merely contains the word", () => {
    // The real OpenAssistant family: "assistant" is not its own token.
    expect(isDraftOnlyFilename("openassistant-3.5d.gguf")).toBe(false);
    expect(isDraftOnlyFilename("OpenAssistant-2.gguf")).toBe(false);
  });

  it("leaves an ordinary chat file alone", () => {
    expect(isDraftOnlyFilename("Qwen3-8B-Instruct-Q4_K_M.gguf")).toBe(false);
  });

  it("reads only the last path segment", () => {
    expect(isDraftOnlyFilename("owner/repo/mtp-model.gguf")).toBe(true);
    expect(isDraftOnlyFilename("mtp-model.gguf/ignored")).toBe(false);
  });

  it("treats no filename as not a draft", () => {
    expect(isDraftOnlyFilename(undefined)).toBe(false);
    expect(isDraftOnlyFilename("")).toBe(false);
  });
});

describe("isDraftOnlySpec", () => {
  it("lets the header decide when it is there", () => {
    expect(
      isDraftOnlySpec({
        ggufMetadata: { architecture: "qwen3-mtp" },
        files: [{ name: "Qwen3-8B-Instruct.gguf" }],
      }),
    ).toBe(true);
  });

  it("never lets a filename overrule a chat header", () => {
    expect(
      isDraftOnlySpec({
        ggufMetadata: { architecture: "llama" },
        files: [{ name: "openassistant-model.gguf" }],
      }),
    ).toBe(false);
  });

  it("does not fall back to the filename when the header says nothing", () => {
    // A header we read but could not classify is not an invitation to
    // guess: the filename would only decide the pre-download case.
    expect(
      isDraftOnlySpec({
        ggufMetadata: { context_length: 4096 },
        files: [{ name: "mtp-Qwen3-30B-A3B.gguf" }],
      }),
    ).toBe(false);
    expect(
      isDraftOnlySpec({
        ggufMetadata: { architecture: "" },
        files: [{ name: "mtp-Qwen3-30B-A3B.gguf" }],
      }),
    ).toBe(false);
  });

  it("falls back to the filename before a download", () => {
    // ggml-org publishes a draft as "mtp-<target>".
    expect(
      isDraftOnlySpec({ files: [{ name: "mtp-Qwen3-30B-A3B.gguf" }] }),
    ).toBe(true);
    expect(
      isDraftOnlySpec({ files: [{ name: "Qwen3-8B-Instruct.gguf" }] }),
    ).toBe(false);
  });

  it("does not read a mid-name MTP as the publisher convention", () => {
    // The convention is the PREFIX "mtp-", not the token anywhere: a
    // converter's output name is not a publisher name.
    expect(
      isDraftOnlySpec({ files: [{ name: "Qwen3-30B-MTP-Q4_K_M.gguf" }] }),
    ).toBe(false);
  });

  it("treats a spec with neither as not a draft", () => {
    expect(isDraftOnlySpec({})).toBe(false);
    expect(isDraftOnlySpec({ files: [] })).toBe(false);
  });
});
