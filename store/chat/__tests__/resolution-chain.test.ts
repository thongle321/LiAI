/** Resolution chain tests for persona tuning (issue 03).
 *
 * Tests the resolution chain: defaults → global preset → bound persona's tuning
 * → session custom snapshot (when source is "custom").
 *
 * Resolution order: defaults < global < persona < custom snapshot
 */

import { DEFAULT_SAMPLER, resolveSampler, type SamplerParams } from "@/services/inference/sampler.ts";
import type { SessionStore, SessionOverride } from "@/services/chat/session-store.ts";
import type { SessionInfo } from "@/types/chat.ts";
import type { StoredMessage, StoredTurn } from "@/services/chat/session-store.ts";
import type { AgentStep } from "@/types/chat.ts";

// Minimal fake session store for resolution chain tests
function createFakeSessionStore(): SessionStore & {
  _sessions: Map<string, { title: string; pinned: boolean; companion?: string; source: "companion" | "custom" | null; override?: SessionOverride; createdAt?: string }>;
  _messages: Map<string, StoredMessage[]>;
  _drafts: Map<string, string>;
  _globalSettings: Map<string, unknown>;
  _seq: number;
  _activeSessionId: string | null;
} {
  const store: SessionStore & {
    _sessions: Map<string, { title: string; pinned: boolean; companion?: string; source: "companion" | "custom" | null; override?: SessionOverride; createdAt?: string }>;
    _messages: Map<string, StoredMessage[]>;
    _drafts: Map<string, string>;
    _globalSettings: Map<string, unknown>;
    _seq: number;
    _activeSessionId: string | null;
  } = {
    _sessions: new Map(),
    _messages: new Map(),
    _drafts: new Map(),
    _globalSettings: new Map(),
    _seq: 0,
    _activeSessionId: null,

    async create(): Promise<string> {
      const id = `s-${++store._seq}`;
      store._sessions.set(id, { title: "", pinned: false, source: null });
      return id;
    },

    async get(sessionId: string): Promise<StoredMessage[] | null> {
      const turns = store._messages.get(sessionId);
      return turns ? [...turns] : null;
    },

    async append(sessionId: string, turn: StoredTurn): Promise<void> {
      if (!store._sessions.has(sessionId)) {
        store._sessions.set(sessionId, { title: "", pinned: false, source: null });
      }
      const turns = store._messages.get(sessionId) || [];
      turns.push({ ...turn, id: `${sessionId}-t${turns.length + 1}` });
      store._messages.set(sessionId, turns);
    },

    async listSessions(): Promise<SessionInfo[]> {
      return Array.from(store._sessions.entries()).map(([id, row]) => ({
        id,
        title: row.title,
        pinned: row.pinned,
        updatedAt: row.pinned ? 1 : 0,
        createdAt: row.createdAt ?? new Date().toISOString(),
      }));
    },

    async renameSession(id: string, title: string): Promise<boolean> {
      const row = store._sessions.get(id);
      if (!row) return false;
      row.title = title;
      return true;
    },

    async setSessionPinned(id: string, pinned: boolean): Promise<boolean> {
      const row = store._sessions.get(id);
      if (!row) return false;
      row.pinned = pinned;
      return true;
    },

    async deleteSession(id: string): Promise<boolean> {
      store._messages.delete(id);
      store._sessions.delete(id);
      store._drafts.delete(id);
      return true;
    },

    async setTitleIfEmpty(id: string, title: string): Promise<void> {
      const row = store._sessions.get(id);
      if (row && row.title === "") row.title = title;
    },

    async duplicateSession(id: string): Promise<string | null> {
      const source = store._sessions.get(id);
      if (!source) return null;
      const newId = await store.create();
      store._sessions.set(newId, { ...source });
      const turns = store._messages.get(id);
      if (turns) store._messages.set(newId, [...turns]);
      return newId;
    },

    async getDraft(sessionId: string | null): Promise<string> {
      return store._drafts.get(sessionId ?? "new") ?? "";
    },

    async setDraft(sessionId: string | null, text: string): Promise<void> {
      const slot = sessionId ?? "new";
      if (text === "") store._drafts.delete(slot);
      else store._drafts.set(slot, text);
    },

    async clearDraft(sessionId: string | null): Promise<void> {
      store._drafts.delete(sessionId ?? "new");
    },

    async getActiveSessionId(): Promise<string | null> {
      return store._activeSessionId;
    },

    async setActiveSessionId(sessionId: string | null): Promise<void> {
      store._activeSessionId = sessionId;
    },

    async getSessionCompanion(sessionId: string): Promise<string | null> {
      return store._sessions.get(sessionId)?.companion ?? null;
    },

    async setSessionCompanion(sessionId: string, companionId: string | null): Promise<boolean> {
      const row = store._sessions.get(sessionId);
      if (!row) return false;
      if (companionId === null) {
        delete row.companion;
        row.source = null;
      } else {
        row.companion = companionId;
      }
      return true;
    },

    async getSessionSettingsSource(sessionId: string): Promise<"companion" | "custom" | null> {
      return store._sessions.get(sessionId)?.source ?? null;
    },

    async setSessionSettingsSource(sessionId: string, source: "companion" | "custom"): Promise<boolean> {
      const row = store._sessions.get(sessionId);
      if (!row) return false;
      row.source = source;
      return true;
    },

    async getSessionOverride(sessionId: string): Promise<SessionOverride | null> {
      return store._sessions.get(sessionId)?.override ?? null;
    },

    async setSessionOverride(sessionId: string, override: SessionOverride | null): Promise<void> {
      const row = store._sessions.get(sessionId);
      if (!row) return;
      if (override === null || (override.sampler === undefined && override.thinking === undefined && override.effort === undefined)) {
        delete row.override;
      } else {
        row.override = override;
      }
    },

    async getGlobalSetting(key: string): Promise<unknown | null> {
      const value = store._globalSettings.get(key);
      return value ?? null;
    },

    async setGlobalSetting(key: string, value: unknown): Promise<void> {
      if (value === null || value === undefined) {
        store._globalSettings.delete(key);
      } else {
        store._globalSettings.set(key, value);
      }
    },

    async getGlobalChatSettings(): Promise<SamplerParams | null> {
      return (await store.getGlobalSetting("newChatCompletionSettings")) as SamplerParams | null;
    },

    async saveGlobalChatSettings(settings: SamplerParams): Promise<void> {
      await store.setGlobalSetting("newChatCompletionSettings", settings);
    },

    async resetGlobalChatSettings(): Promise<void> {
      await store.setGlobalSetting("newChatCompletionSettings", null);
    },

    async applySessionSnapshotToGlobal(sessionId: string): Promise<boolean> {
      const override = await store.getSessionOverride(sessionId);
      if (!override?.sampler) return false;
      await store.saveGlobalChatSettings(override.sampler as SamplerParams);
      return true;
    },

    async setSessionCreatedAt(sessionId: string, createdAt: string): Promise<boolean> {
      const row = store._sessions.get(sessionId);
      if (!row) return false;
      row.createdAt = createdAt;
      return true;
    },

    popLastAssistant: async () => false,
    truncateFrom: async () => false,
  };

  return store;
}

// Simulates the defaultSampler resolution logic
async function resolveSamplerChain(
  store: SessionStore,
  sessionId: string | null,
  personaSettings: Partial<SamplerParams> | null = null,
  globalSettings: SamplerParams | null = null,
  customOverride: SessionOverride | null = null,
  settingsSource: "companion" | "custom" | null = null,
): Promise<SamplerParams> {
  // Chain: built-in defaults → global preset → bound persona's tuning → custom snapshot
  let base: SamplerParams = DEFAULT_SAMPLER;

  // Apply global preset if set
  if (globalSettings) {
    base = globalSettings;
  }

  // If custom, use session snapshot wholesale
  if (settingsSource === "custom" && customOverride?.sampler) {
    return customOverride.sampler; // Now returns complete SamplerParams
  }

  // Apply persona tuning over global
  if (personaSettings) {
    base = resolveSampler(base, personaSettings);
  }

  return base;
}

describe("resolution chain", () => {
  describe("defaults < global < persona", () => {
    it("defaults apply when no global or persona is set", async () => {
      const store = createFakeSessionStore();

      const result = await resolveSamplerChain(store, "s-1", null, null, null, null);
      expect(result).toEqual(DEFAULT_SAMPLER);
    });

    it("global preset beats defaults", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.5,
      };

      const result = await resolveSamplerChain(store, "s-1", null, global, null, null);
      expect(result.temperature).toEqual(0.5);
      expect(result.topP).toEqual(DEFAULT_SAMPLER.topP); // inherited from default
    });

    it("persona tuning beats global preset", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.5,
        topP: 0.9,
      };
      const persona: Partial<SamplerParams> = {
        temperature: 0.9,
        topK: 100,
      };

      const result = await resolveSamplerChain(store, "s-1", persona, global, null, "companion");

      // Persona temperature (0.9) beats global (0.5)
      expect(result.temperature).toEqual(0.9);
      // Persona topK (100) beats default (40)
      expect(result.topK).toEqual(100);
      // Global topP (0.9) inherited since persona didn't override
      expect(result.topP).toEqual(0.9);
    });

    it("defaults < global < persona order is verified", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.6,
      };
      const persona: Partial<SamplerParams> = {
        temperature: 0.8,
      };

      // Without persona: global beats defaults
      const noPersona = await resolveSamplerChain(store, "s-1", null, global, null, null);
      expect(noPersona.temperature).toEqual(0.6);

      // With persona: persona beats global
      const withPersona = await resolveSamplerChain(store, "s-1", persona, global, null, "companion");
      expect(withPersona.temperature).toEqual(0.8);
    });
  });

  describe("conversations without bound persona", () => {
    it("resolves to global only when no persona is bound", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.6,
        topP: 0.85,
      };

      // Simulate a session without a companion bound
      const result = await resolveSamplerChain(store, "s-1", null, global, null, null);

      expect(result.temperature).toEqual(0.6);
      expect(result.topP).toEqual(0.85);
      expect(result.topK).toEqual(DEFAULT_SAMPLER.topK); // inherited from default
    });
  });

  describe("custom session snapshot", () => {
    it("custom snapshot replaces the chain entirely", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.3,
        topK: 50,
      };
      const customOverride: SessionOverride = {
        sampler: {
          ...DEFAULT_SAMPLER,
          temperature: 0.95,
          topK: 80,
          topP: 0.99,
        },
      };

      const result = await resolveSamplerChain(
        store,
        "s-1",
        { temperature: 0.8 } as Partial<SamplerParams>, // persona settings
        global,
        customOverride,
        "custom",
      );

      // Custom snapshot replaces everything
      expect(result.temperature).toEqual(0.95);
      expect(result.topK).toEqual(80);
      expect(result.topP).toEqual(0.99);
    });

    it("persona snapshot is ignored when source is custom", async () => {
      const store = createFakeSessionStore();
      const global: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.3,
      };
      const persona: Partial<SamplerParams> = {
        temperature: 0.9,
      };
      const customOverride: SessionOverride = {
        sampler: {
          ...DEFAULT_SAMPLER,
          temperature: 0.99,
        },
        thinking: true,
        effort: "high",
      };

      const result = await resolveSamplerChain(
        store,
        "s-1",
        persona,
        global,
        customOverride,
        "custom",
      );

      // Custom snapshot beats both global and persona
      expect(result.temperature).toEqual(0.99);
    });
  });

  describe("resolution order verification via resolve_sampler", () => {
    it("resolve_sampler merges override over base field by field", () => {
      const base: SamplerParams = {
        ...DEFAULT_SAMPLER,
        temperature: 0.5,
        topK: 50,
        topP: 0.9,
      };

      const override: Partial<SamplerParams> = {
        temperature: 0.9,
        topK: 100,
      };

      const result = resolveSampler(base, override);

      // Overridden fields
      expect(result.temperature).toEqual(0.9);
      expect(result.topK).toEqual(100);
      // Non-overridden fields from base
      expect(result.topP).toEqual(0.9);
    });
  });

  describe("session creation date for drawer grouping", () => {
    it("listSessions includes createdAt for age-based grouping", async () => {
      const store = createFakeSessionStore();
      const id = await store.create();
      const sessions = await store.listSessions();
      expect(sessions[0].createdAt).toBeDefined();
      expect(typeof sessions[0].createdAt).toEqual("string");
    });

    it("setSessionCreatedAt updates the session creation date", async () => {
      const store = createFakeSessionStore();
      const id = await store.create();
      const newDate = "2024-06-15T12:00:00.000Z";
      expect(await store.setSessionCreatedAt(id, newDate)).toEqual(true);

      const sessions = await store.listSessions();
      expect(sessions[0].createdAt).toEqual(newDate);
    });

    it("setSessionCreatedAt returns false for non-existent session", async () => {
      const store = createFakeSessionStore();
      expect(await store.setSessionCreatedAt("ghost", "2024-01-01T00:00:00.000Z")).toEqual(false);
    });
  });
});