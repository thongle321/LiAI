/** The ONE context banner slot: which variant renders, and which words.
 *
 * Pure, so it is node-testable; the .tsx cannot be, because it imports
 * react-native. Ported from PocketParity:
 * pocketpal-ai/src/utils/bannerVariantResolver.ts (whole file) and the
 * context-full copy precedence at
 * components/ChatView/BannerRow.tsx:207-218.
 *
 * One variant at a time, in a fixed precedence — context-full, then
 * context-warning, then the remote cut-off notice, then the HTML soft-cap
 * notice, then none — so only one surface ever competes with the composer.
 */

/** Used / n_ctx ratio at which the soft "getting tight" warning fires. */
export const WARNING_THRESHOLD = 0.8;
/** Headroom below the window; the full banner auto-clears once a later
 *  turn's occupancy drops below `windowSize - AUTOCLEAR_RUNWAY`. */
export const AUTOCLEAR_RUNWAY = 256;
/** Remote replies shorter than this are never flagged as cut off — a short
 *  reply that trails off is more likely a terse answer than a truncation. */
export const MIN_REMOTE_TOKENS = 500;
/** HTML-preview surfaces in one conversation before the soft cap speaks. */
export const HTML_SOFT_CAP_COUNT = 4;
/** Consecutive context-full turns before the banner escalates its wording. */
export const ESCALATED_AFTER_FAILURES = 2;

export type BannerVariant =
  | "context-full"
  | "context-warning"
  | "remote-cut-off"
  | "html-soft-cap"
  | "none";

/** Which context-full wording to use. Remote wins outright: the other two
 *  copies both advise raising the context size, and a remote model has no
 *  in-app control for it. */
export type ContextFullCopy = "remote" | "heavy-tool" | "escalated" | "default";

/** The newest assistant turn, as the resolver sees it. Every field is
 *  optional because every one of them is "the engine did not say". */
export interface BannerSnapshot {
  contextFull?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  /** The engine declared a length stop (`stoppedEarly`). */
  stoppedEarly?: boolean;
  content?: string;
}

export interface BannerInput {
  /** The window this thread divides by; undefined until a remote probe
   *  lands (services/chat//context-fill.ts). */
  windowSize: number | undefined;
  isRemote: boolean;
  modelLoaded: boolean;
  htmlPreviewCount: number;
  dismissed: ReadonlySet<BannerVariant>;
  /** A talent declaring a recommended context cost, from the turn's last
   *  tool. See `recommendedContextTokens` on ToolDefinition. */
  heavyToolName?: string;
  consecutiveFullFailures?: number;
}

export interface BannerResolution {
  variant: BannerVariant;
  /** Present on context-full only: which wording to use. */
  copy?: ContextFullCopy;
  /** Fill as a 0-1 ratio, for the meter. Present only on the two
   *  window-reading variants. */
  ratio?: number;
  heavyToolName?: string;
}

/** Does the text end on a sentence-ending mark? Its own helper because it
 *  is the whole of the "did it finish?" test, and it has to know about the
 *  full-width forms a Chinese or Japanese reply ends on. */
export function endsWithTerminalPunctuation(text: string | undefined): boolean {
  if (!text) return false;
  return /[.!?。！？]["')\]]?\s*$/.test(text.trimEnd());
}

/** The remote cut-off notice: four conditions, all required.
 *
 *  A remote reply that is long, ended on its own, and stopped mid-sentence
 *  was probably cut somewhere we cannot see. A reply that stopped because
 *  the endpoint SAID it hit a length cap is a different, already-explained
 *  event. */
export function isRemoteCutOff(turn: {
  isRemote: boolean;
  completionTokens?: number;
  stoppedEarly?: boolean;
  content?: string;
}): boolean {
  return (
    turn.isRemote &&
    turn.stoppedEarly !== true &&
    turn.completionTokens !== undefined &&
    turn.completionTokens >= MIN_REMOTE_TOKENS &&
    !endsWithTerminalPunctuation(turn.content)
  );
}

/** How many context-full turns have failed back to back, newest first.
 *
 *  Derived from the outcomes themselves rather than kept in a counter that
 *  has to be incremented and reset in step with them: the chain of turns IS
 *  the counter, and any successful turn ends it. */
export function consecutiveFullFailures(
  outcomes: readonly { contextFull?: boolean }[],
): number {
  let n = 0;
  for (let i = outcomes.length - 1; i >= 0; i -= 1) {
    if (outcomes[i].contextFull !== true) break;
    n += 1;
  }
  return n;
}

/** The context-full wording, in precedence order: remote, heavy tool,
 *  escalation, default. */
export function contextFullCopy(input: {
  isRemote: boolean;
  heavyToolName?: string;
  consecutiveFullFailures?: number;
}): ContextFullCopy {
  if (input.isRemote) return "remote";
  if (input.heavyToolName !== undefined && input.heavyToolName !== "") {
    return "heavy-tool";
  }
  if ((input.consecutiveFullFailures ?? 0) >= ESCALATED_AFTER_FAILURES) {
    return "escalated";
  }
  return "default";
}

/** Add one dismissal. Returns a new set — the caller's set is state. */
export function dismissBanner(
  current: ReadonlySet<BannerVariant>,
  variant: BannerVariant,
): Set<BannerVariant> {
  return new Set([...current, variant]);
}

/**
 * Resolve the single banner variant to render. Pure: no JSX, no store
 * writes, no async.
 */
export function resolveBannerVariant(
  snapshot: BannerSnapshot | undefined,
  input: BannerInput,
): BannerResolution {
  const { windowSize, isRemote, modelLoaded, htmlPreviewCount, dismissed } =
    input;

  // The context-* variants read a window and a live engine. The cut-off
  // notice reads neither — a remote reply is in hand by then — but still
  // wants a model: with none loaded there is no reply to doubt.
  if (snapshot && modelLoaded) {
    const used = snapshot.promptTokens;

    if (windowSize !== undefined && windowSize > 0 && used !== undefined) {
      const ratio = Math.min(1, Math.max(0, used / windowSize));

      // 1. context-full — inside the runway. Outside it the thread
      // recovered on its own and the banner clears itself.
      if (
        snapshot.contextFull === true &&
        used >= windowSize - AUTOCLEAR_RUNWAY &&
        !dismissed.has("context-full")
      ) {
        return {
          variant: "context-full",
          copy: contextFullCopy(input),
          ratio,
          ...(input.heavyToolName !== undefined
            ? { heavyToolName: input.heavyToolName }
            : {}),
        };
      }

      // 2. context-warning — near the limit, RAW ratio compared.
      if (
        snapshot.contextFull !== true &&
        used / windowSize >= WARNING_THRESHOLD &&
        !dismissed.has("context-warning")
      ) {
        return { variant: "context-warning", ratio };
      }
    }

    // 3. remote-cut-off.
    if (
      isRemoteCutOff({
        isRemote,
        ...(snapshot.completionTokens !== undefined
          ? { completionTokens: snapshot.completionTokens }
          : {}),
        ...(snapshot.stoppedEarly !== undefined
          ? { stoppedEarly: snapshot.stoppedEarly }
          : {}),
        ...(snapshot.content !== undefined ? { content: snapshot.content } : {}),
      }) &&
      !dismissed.has("remote-cut-off")
    ) {
      return { variant: "remote-cut-off" };
    }
  }

  // 4. html-soft-cap — a standing hint about the conversation, so it reads
  // no model state at all and appears with no model loaded.
  if (htmlPreviewCount >= HTML_SOFT_CAP_COUNT) {
    return { variant: "html-soft-cap" };
  }

  // 5. none.
  return { variant: "none" };
}