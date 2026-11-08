/** The editor's draft -> stored-companion mapping (PocketPal's PalSheet
 *  onSubmit, minus the form library).
 *
 *  These are the rules the sheet must not get wrong: a greeting can be
 *  prompts-only, a cleared model must be written as `null` (undefined is the
 *  repository's "leave untouched" gate), and editing must not reset fields
 *  the editor never owned.
 */

import {
  buildCompanionFields,
  type CompanionEditorDraft,
} from "../editor-draft.ts";

function draft(overrides: Partial<CompanionEditorDraft> = {}): CompanionEditorDraft {
  return {
    id: null,
    name: "Sage",
    description: "",
    thumbnail: "",
    systemPrompt: "You are Sage.",
    originalSystemPrompt: "You are Sage.",
    isSystemPromptChanged: false,
    parameters: {},
    parameterSchema: [],
    talentNames: new Set(),
    greetingText: "",
    suggestedPrompts: "",
    color: null,
    modelRef: null,
    completionSettings: null,
    capabilities: {},
    useAIPrompt: false,
    promptGenerationModel: null,
    generatingPrompt: "",
    ...overrides,
  };
}

describe("buildCompanionFields", () => {
  it("keeps suggested prompts when there is no greeting text", () => {
    const fields = buildCompanionFields(
      draft({ suggestedPrompts: " Hello \n\nWhat can you do? " }),
    );
    expect(fields.greeting).toEqual({
      text: "",
      suggestedPrompts: ["Hello", "What can you do?"],
    });
  });

  it("omits suggestedPrompts when there are none", () => {
    const fields = buildCompanionFields(draft({ greetingText: "Hi there" }));
    expect(fields.greeting).toEqual({ text: "Hi there" });
  });

  it("erases the greeting when both halves are blank", () => {
    const fields = buildCompanionFields(
      draft({ greetingText: "   ", suggestedPrompts: "\n  \n" }),
    );
    expect(fields.greeting).toBeNull();
  });

  it("writes a cleared model as null so the update gate erases it", () => {
    expect(buildCompanionFields(draft()).defaultModel).toBeNull();
  });

  it("writes a cleared description as null so the update gate erases it", () => {
    expect(buildCompanionFields(draft({ description: "   " })).description).toBeNull();
  });

  it("writes a reset generation-settings override as null", () => {
    expect(
      buildCompanionFields(draft({ completionSettings: null })).completionSettings,
    ).toBeNull();
  });

  it("carries the recommended model ref through", () => {
    const ref = { id: "m1", name: "Model One", author: "Author" };
    expect(buildCompanionFields(draft({ modelRef: ref })).defaultModel).toEqual(ref);
  });

  it("preserves capabilities instead of resetting them", () => {
    const fields = buildCompanionFields(
      draft({ capabilities: { multimodal: true } }),
    );
    expect(fields.base.capabilities).toEqual({ multimodal: true });
  });

  it("keeps only talents the registry knows", () => {
    const fields = buildCompanionFields(
      draft({ talentNames: new Set(["web_search", "not_a_talent"]) }),
    );
    expect(fields.base.pact).toEqual({
      talents: [{ name: "web_search", necessity: "required" }],
    });
  });

  it("trims the name and drops a blank description", () => {
    const fields = buildCompanionFields(
      draft({ name: "  Sage  ", description: "   " }),
    );
    expect(fields.base.name).toEqual("Sage");
    expect(fields.description).toBeNull();
  });
});
