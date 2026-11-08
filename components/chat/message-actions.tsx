/** The footer under a finished assistant turn: speak, copy, and the line
 * that explains how it went.
 *
 * PocketPal's AssistantTurnFooter holds exactly this set — a TTS toggle,
 * copy, timings, and an interrupted/truncated marker — with regenerate
 * living only in the long-press menu. Ours had copy + regenerate + speak
 * plus a per-turn token count; regenerate moved to the menu (MessageMenu
 * already carries onRegenerate, so nothing new was needed) and the counts
 * moved out entirely — the session chip above the composer is gone too, so
 * the chat shows no token counts at all.
 *
 * Timing strings are PocketPal's (AssistantTurnFooter.tsx:57-113, en.json
 * 567-576), comma-joined, with TTFT last: `40ms/token, 24.60 tokens/sec,
 * 97.40 prompt tokens/sec, 5174ms TTFT`. Ours printed raw floats —
 * `5174.513 ms to first token` — which is a float leaking into the UI.
 *
 * Rendered only for a settled turn: copy needs final text and the timings
 * of a half-streamed reply are noise (theirs gates the same two the same
 * way — PlayButton returns null while streaming, and `copyable` is not
 * set until run_finished).
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check, Copy, Volume2, VolumeX } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import * as Haptics from "expo-haptics";
import { useCopy } from "@/hooks/useCopy.ts";
import { speakReply, stopSpeaking } from "@/services/voice/voice-speak.ts";
import { useVoice } from "@/store/voice.ts";
import type { TurnOutcomeFlags } from "@/types/chat.ts";

/** A reported number, or absent. NOT `> 0`: a zero rate is a
 *  measurement, and their finiteNumber() shows it. The old code gated on
 *  `> 0` while its own comment argued for the opposite. */
function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function MessageActions({
  text,
  outcome,
  contextBannerVisible,
}: {
  text: string;
  /** How the turn ended. Absent when the engine reported nothing. */
  outcome?: TurnOutcomeFlags;
  /** True when the context-full banner is on screen for this
   *  conversation. It then owns the message, so the footer must not also
   *  say "Cut off": saying it twice is noise, not emphasis. */
  contextBannerVisible?: boolean;
}) {
  const colors = useColors();
  const { copied, copy } = useCopy();
  // The speak button exists only while TTS is available (ticket 05 /
  // spec Q14 — same rule as the store, read reactively).
  const canSpeak = useVoice((s) => s.userTTSOverride ?? s.deviceMeetsMemory);
  // Per-message TTS over the system voice (settings UX owns voice/rate).
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;

  function toggleSpeak(): void {
    if (speakingRef.current) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const reset = () => setSpeaking(false);
    try {
      speakReply(text, { onDone: reset, onStopped: reset, onError: reset });
      setSpeaking(true);
    } catch {
      reset();
    }
  }

  useEffect(() => {
    return () => {
      // Session switch unmounts the list mid-speech: don't orphan audio.
      if (speakingRef.current) stopSpeaking();
    };
  }, []);

  const t = outcome?.timings;
  const msPerToken = finite(t?.msPerToken);
  const tokensPerSec = finite(t?.tokensPerSecond);
  const promptTokensPerSec = finite(t?.promptTokensPerSecond);
  // Our `promptMs` is the time to first token; theirs calls it
  // `time_to_first_token_ms`. Same measurement, and it goes last because
  // theirs puts it last.
  const ttft = finite(t?.promptMs);

  const timingParts: string[] = [];
  if (msPerToken !== undefined) timingParts.push(`${Math.round(msPerToken)}ms/token`);
  if (tokensPerSec !== undefined) timingParts.push(`${tokensPerSec.toFixed(2)} tokens/sec`);
  if (promptTokensPerSec !== undefined) {
    timingParts.push(`${promptTokensPerSec.toFixed(2)} prompt tokens/sec`);
  }
  if (ttft !== undefined) timingParts.push(`${Math.round(ttft)}ms TTFT`);

  const marker =
    outcome?.interrupted === true
      ? "Interrupted"
      : outcome?.contextFull === true && contextBannerVisible !== true
        ? "Cut off — likely context full"
        : null;

  // PocketPal's footer renders whenever there is something to say (copy,
  // speak, timings or an interrupted/cut-off marker). Copy and speak are
  // NOT coupled to timings: a turn with no metrics still gets Copy (and
  // Speak when TTS is available). Only an entirely empty turn adds no row.
  const hasText = text.trim() !== "";
  if (!hasText && timingParts.length === 0 && marker === null && !canSpeak) {
    return null;
  }

  return (
    // PocketPal's AssistantTurnFooter container (their styles.ts:7-12):
    // one row, gap 5, paddingBottom 12. No flex-wrap and no spacing
    // boxes — the row reads as a status line: speak, copy, then the
    // joined timing string inline. The glyphs clear the 48dp touch floor
    // through hitSlop (16dp glyph + 2×16 slop = 48dp), PocketPal's own
    // device, rather than a 48dp press box that would spread the icons
    // apart and push the stats onto their own line.
    <View className="mt-1 flex-row items-center gap-x-[5px] pb-3">
      {canSpeak && hasText ? (
        <Pressable
          onPress={toggleSpeak}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={speaking ? "Stop speaking" : "Speak message"}
          testID="footer-speak"
        >
          {speaking ? (
            <VolumeX size={16} color={colors.primary} />
          ) : (
            <Volume2 size={16} color={colors.secondaryText} />
          )}
        </Pressable>
      ) : null}
      {hasText ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            copy(text);
          }}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy message"}
          testID="footer-copy"
        >
        {copied ? (
          <Check size={16} color={colors.successMark} />
        ) : (
          <Copy size={16} color={colors.secondaryText} />
        )}
      </Pressable>
      ) : null}
      {marker !== null && (
        <Text className="font-sans text-micro text-error">{marker}</Text>
      )}
      {timingParts.length > 0 && (
        <Text className="font-sans text-micro text-secondary-text">
          {timingParts.join(", ")}
        </Text>
      )}
    </View>
  );
}
