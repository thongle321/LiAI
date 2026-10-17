/** The ONE context banner slot, derived.
 *
 * Which of the five variants renders is
 * services/chat/banner-variant.ts's decision, and that resolver is pure so it
 * is node-testable. What used to sit inline in `app/(drawer)/(tabs)/chat.tsx`
 * is the part that is neither: walking the thread for the newest assistant
 * turn, counting HTML previews, naming a heavy tool, counting consecutive
 * context-full failures, resolving the effective window, and holding the
 * per-session dismissals. That is a view-model, so it lives here and the
 * route keeps only state collection and JSX.
 *
 * Nothing here touches react-native, which is what lets the route shed ~120
 * lines without losing a seam to test through.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  consecutiveFullFailures,
  dismissBanner,
  resolveBannerVariant,
  type BannerResolution,
  type BannerVariant,
} from "../services/chat/banner-variant.ts";
import { effectiveNCtx, fillPercent } from "../services/chat/context-fill.ts";
import { talentDefinitions } from "../services/agent/registry.ts";
import type { ChatMessage } from "../types/chat.ts";
import type { RemoteCaps } from "../types/models.ts";

export interface ChatBannerInput {
  messages: readonly ChatMessage[];
  /** The local context setting (store/inference.ts `nCtx`). */
  nCtx: number;
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;
  /** Probed provider snapshots (C7): remote window lengths live here. */
  remoteCaps: Record<string, RemoteCaps>;
}

export interface UseChatBanner {
  /** Which variant renders, and its copy. `variant: "none"` means nothing. */
  banner: BannerResolution;
  bannerShowing: boolean;
  /** True for the context-full variant only — the list's sticky offset. */
  contextFullShowing: boolean;
  /** 0-100 for the meter's bar. */
  fill: number;
  /** Hide the current variant for exactly one turn. */
  dismiss: () => void;
}

const REMOTE_ID_PREFIX = "remote-";

export function useChatBanner(input: ChatBannerInput): UseChatBanner {
  const { messages, nCtx, activeModelId, activeProviderType, remoteCaps } =
    input;

  // The banner speaks for the NEWEST assistant turn and nothing else.
  // Scoping it that way makes it self-clearing: keep chatting, answer
  // successfully, and it goes away without a reset rule.
  const newestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  // Dismissals are held PER SESSION and cleared when each turn is recorded,
  // so a banner stays gone for exactly one turn and the next occurrence of
  // the same problem speaks again.
  const [dismissed, setDismissed] = useState<ReadonlySet<BannerVariant>>(
    () => new Set<BannerVariant>(),
  );
  const turnCount = messages.length;
  useEffect(() => {
    setDismissed(new Set<BannerVariant>());
  }, [turnCount]);

  // C4: the window this thread divides by. Local = configured nCtx; remote =
  // the C7 /props contextLength, which is unknown until a probe lands — and
  // an unknown window never warns and never fills.
  const isRemote = activeProviderType === "remote";
  const windowSize = effectiveNCtx({
    isRemote,
    localNCtx: nCtx,
    remoteContextLength:
      activeModelId?.startsWith(REMOTE_ID_PREFIX) === true
        ? remoteCaps[activeModelId.slice(REMOTE_ID_PREFIX.length)]
            ?.contextLength
        : undefined,
  });

  // Every HTML preview surface in the conversation. The soft-cap notice
  // reads this and NO model state, which is why it can appear with no model
  // loaded.
  const htmlPreviewCount = useMemo(() => {
    let n = 0;
    for (const m of messages) {
      for (const step of m.steps ?? []) {
        if (step.tool === "render_html" && step.ok !== false) n += 1;
      }
    }
    return n;
  }, [messages]);

  // The turn's LAST tool, when its definition declares a recommended context
  // cost. No talent declares one yet, so this reads undefined until one does —
  // the field is opt-in precisely so that day changes nothing else.
  const heavyToolName = useMemo(() => {
    const steps = newestAssistant?.steps ?? [];
    let maxTokens = -1;
    let maxTool: string | undefined;
    for (const step of steps) {
      const def = talentDefinitions().find(
        (t) => t.function.name === step.tool,
      );
      if (!def) continue;
      const tokens = def.function.recommendedContextTokens;
      if (tokens !== undefined && tokens > maxTokens) {
        maxTokens = tokens;
        maxTool = def.function.name;
      }
    }
    return maxTool;
  }, [newestAssistant]);

  const fullFailures = useMemo(
    () =>
      consecutiveFullFailures(
        messages
          .filter((m) => m.role === "assistant")
          .map((m) => m.outcome ?? {}),
      ),
    [messages],
  );

  const banner = useMemo(
    () =>
      resolveBannerVariant(
        newestAssistant
          ? {
              ...(newestAssistant.outcome?.contextFull !== undefined
                ? { contextFull: newestAssistant.outcome.contextFull }
                : {}),
              ...(newestAssistant.usage !== undefined
                ? {
                    promptTokens: newestAssistant.usage.promptTokens,
                    completionTokens: newestAssistant.usage.completionTokens,
                  }
                : {}),
              ...(newestAssistant.outcome?.stoppedEarly !== undefined
                ? { stoppedEarly: newestAssistant.outcome.stoppedEarly }
                : {}),
              content: newestAssistant.text,
            }
          : undefined,
        {
          windowSize,
          isRemote,
          modelLoaded: activeModelId !== null,
          htmlPreviewCount,
          dismissed,
          consecutiveFullFailures: fullFailures,
          ...(heavyToolName !== undefined ? { heavyToolName } : {}),
        },
      ),
    [
      newestAssistant,
      windowSize,
      isRemote,
      activeModelId,
      htmlPreviewCount,
      dismissed,
      fullFailures,
      heavyToolName,
    ],
  );

  const variant = banner.variant;
  const dismiss = useCallback(() => {
    setDismissed(dismissBanner(dismissed, variant));
  }, [dismissed, variant]);

  return {
    banner,
    bannerShowing: variant !== "none",
    contextFullShowing: variant === "context-full",
    // `?? 0` is dead-in-practice: a FULL banner implies the local engine
    // (remote hardcodes contextFull: false) so windowSize is nCtx there,
    // and the warning branch only renders when the resolver already saw a
    // real window. fillPercent(…, 0) would read 0 rather than divide blind.
    fill: fillPercent(newestAssistant?.usage?.promptTokens, windowSize ?? 0),
    dismiss,
  };
}