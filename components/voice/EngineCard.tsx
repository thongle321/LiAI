/** One downloadable voice engine (spec Q2 — reversed 2026-10-14).
 *
 * PocketPal's engine-group card, rebuilt on this app's stack: a collapsed
 * header that stays actionable (Download lives ON the card, per the Voice
 * settings design) and an expanded body that adapts to the engine's
 * download state — install copy / progress / error / the curated voice
 * rows.
 *
 * Everything it renders comes from lib/tts/engineMeta.ts (title, badge,
 * spec line, model id, voices) and lib/tts/voiceUi.ts (which body the
 * state maps to), so this file holds no engine knowledge at all: adding a
 * fourth engine is a table row, not a new component.
 *
 * Motion: Reanimated at the app's one duration/easing (lib/motion.ts).
 * The expanded height is animated on the UI thread, and the body's height
 * is measured from its INNER view — which lays out at natural size even
 * while the outer wrapper is clamped to 0, so the first expand knows its
 * target instead of jumping from nothing.
 *
 * The chevron is a glyph swap (ChevronRight/ChevronDown), NOT a rotation:
 * SettingsRows' AdvancedGroup records that a style-rotated lucide icon
 * rendered invisible on device.
 */

import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  AudioLines,
  Cat,
  ChevronDown,
  ChevronRight,
  Download,
  Gauge,
  Square,
  Trash2,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import {
  MOTION_DURATION_MS,
  motionEasing,
} from "../../lib/motion.ts";
import { NEURAL_ENGINE_META } from "../../lib/tts/engineMeta.ts";
import { engineGroupState, voiceTap } from "../../lib/tts/voiceUi.ts";
import { useFreeSpacePoll } from "../../hooks/useStorageDisclosure.ts";
import type { NeuralEngineId, Voice } from "../../lib/tts/types.ts";
import { VOICE_PREVIEW_SAMPLE } from "../../constants/voice-strings.ts";
import { useVoice } from "../../store/voice.ts";

/** The engine's glyph. Lucide only — no bundled logo PNGs, which is what
 *  lets one card serve every engine. */
const ENGINE_ICON = { kitten: Cat, kokoro: AudioLines, supertonic: Gauge } as const;

/** PocketPal's disk preflight: the model must fit with 20% headroom. */
const DISK_HEADROOM = 1.2;

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-border">
      {checked ? <View className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
    </View>
  );
}

export function EngineCard({ engineId }: { engineId: NeuralEngineId }) {
  const meta = NEURAL_ENGINE_META[engineId];
  const downloads = useVoice((s) => s.downloads);
  const currentVoice = useVoice((s) => s.currentVoice);
  const setCurrentVoice = useVoice((s) => s.setCurrentVoice);
  const startEngineDownload = useVoice((s) => s.startEngineDownload);
  const cancelEngineDownload = useVoice((s) => s.cancelEngineDownload);
  const removeEngineModel = useVoice((s) => s.removeEngineModel);
  const play = useVoice((s) => s.play);
  const stop = useVoice((s) => s.stop);

  const [expanded, setExpanded] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const group = engineGroupState(downloads[engineId]);
  const Icon = ENGINE_ICON[engineId];

  // Free space only matters while there is something to download; a ready
  // engine has no Download button and needs no preflight. The shared hook
  // owns the read and the interval — no second poller here.
  const { freeBytes } = useFreeSpacePoll(group.kind !== "ready");

  const lowDisk = freeBytes !== null && freeBytes < meta.modelBytes * DISK_HEADROOM;

  // Expand/collapse. `measured` is the body's natural height, read from the
  // inner view's onLayout while the outer wrapper is still clamped to 0.
  const height = useSharedValue(0);
  const measured = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const target = expanded ? measured.value : 0;
    height.value = withTiming(target, { duration: MOTION_DURATION_MS, easing: motionEasing });
    opacity.value = withTiming(expanded ? 1 : 0, {
      duration: MOTION_DURATION_MS,
      easing: motionEasing,
    });
  }, [expanded, height, measured, opacity]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  function startDownload(): void {
    setErrorNote(null);
    void startEngineDownload(engineId).catch((error: unknown) => {
      // The store reports failures through the per-engine status; this only
      // covers a rejection the bridge never reported.
      setErrorNote(error instanceof Error ? error.message : String(error));
    });
  }

  function onRemove(): void {
    Alert.alert(
      `Remove ${meta.title}?`,
      `This frees ${Math.round(meta.modelBytes / 1_000_000)} MB on your device. You can download it again at any time.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setPreviewingId(null);
            setErrorNote(null);
            // Stop first: the native PCM player holds the model open.
            void stop();
            void removeEngineModel(engineId).catch((error: unknown) => {
              setErrorNote(error instanceof Error ? error.message : String(error));
            });
          },
        },
      ],
    );
  }

  function onTapVoice(voice: Voice): void {
    const outcome = voiceTap({
      tapped: voice,
      engine: engineId,
      currentVoice,
      previewingId,
      status: downloads[engineId],
    });
    if (outcome.kind === "unavailable") return;
    if (outcome.kind === "stop-preview") {
      setPreviewingId(null);
      void stop();
      return;
    }
    setCurrentVoice(voice);
    setPreviewingId(voice.id);
    setErrorNote(null);
    void play(VOICE_PREVIEW_SAMPLE, { voice })
      .catch(() => {
        // A failed preview is advisory; the selection still stands.
      })
      .finally(() => {
        setPreviewingId((id) => (id === voice.id ? null : id));
      });
  }

  return (
    <View className="voice-card mb-3">
      {/* Collapsed header — tapping anywhere but the button expands, so the
          card itself is the disclosure affordance. */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${meta.title} — ${meta.spec}`}
        className="voice-card__header"
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-full ${
            meta.warmBadge ? "bg-orange-100" : "bg-surface-3"
          }`}
        >
          <Icon size={20} color={meta.warmBadge ? "#c2410c" : colors.primary} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="voice-card__title">{meta.title}</Text>
            <View className={meta.warmBadge ? "voice-badge voice-badge--warm" : "voice-badge"}>
              <Text className="voice-badge__text">{meta.badge}</Text>
            </View>
          </View>
          <Text className="voice-card__spec">{meta.spec}</Text>
        </View>
        {/* The action stays on the collapsed card (design), so a card that
            has never been expanded is still fully usable. */}
        {group.kind === "install" ? (
          <Pressable
            onPress={startDownload}
            disabled={lowDisk}
            accessibilityRole="button"
            accessibilityLabel={`Download the ${meta.title} voice model`}
            className={`btn btn--tonal flex-row items-center gap-2 px-4 py-2${lowDisk ? " opacity-40" : ""}`}
          >
            <Download size={16} color={colors.primary} />
            <Text className="font-sans-semibold text-body-md text-primary">Download</Text>
          </Pressable>
        ) : null}
        {group.kind === "downloading" ? (
          <Pressable
            onPress={() => cancelEngineDownload()}
            accessibilityRole="button"
            accessibilityLabel={`Cancel the ${meta.title} download`}
            className="btn btn--ghost px-4 py-2"
          >
            <Text className="font-sans-semibold text-body-md text-primary">
              {`${group.percent}%`}
            </Text>
          </Pressable>
        ) : null}
        {group.kind === "error" ? (
          <Pressable
            onPress={startDownload}
            accessibilityRole="button"
            accessibilityLabel={`Retry the ${meta.title} download`}
            className="btn btn--tonal px-4 py-2"
          >
            <Text className="font-sans-semibold text-body-md text-primary">Retry</Text>
          </Pressable>
        ) : null}
        {expanded ? (
          <ChevronDown size={16} color={colors.secondaryText} />
        ) : (
          <ChevronRight size={16} color={colors.secondaryText} />
        )}
      </Pressable>

      <Animated.View style={bodyStyle}>
        {/* Inner view is unconstrained, so its onLayout reports the body's
            natural height even while the wrapper above is clamped to 0. */}
        <View
          className="voice-card__body"
          onLayout={(e) => {
            measured.value = e.nativeEvent.layout.height;
          }}
        >
          {group.kind === "ready" ? (
            <View>
              {meta.voices.map((voice) => {
                const selected = currentVoice?.id === voice.id;
                const previewing = previewingId === voice.id;
                return (
                  <Pressable
                    key={voice.id}
                    onPress={() => onTapVoice(voice)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={
                      previewing
                        ? `Stop previewing ${voice.name}`
                        : `Speak with ${voice.name} and preview`
                    }
                    className="flex-row items-center gap-3 py-2"
                  >
                    <RadioDot checked={selected} />
                    <Text className="flex-1 font-sans text-body-md text-primary-text">
                      {voice.name}
                    </Text>
                    {previewing ? <Square size={14} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              <Text className="mt-1 font-sans text-body-sm text-secondary-text">
                Tap a voice to select it and hear a sample.
              </Text>
              <Pressable
                onPress={onRemove}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${meta.title} voice model and free its storage`}
                className="btn btn--ghost mt-3 flex-row items-center gap-2 px-5 py-2"
              >
                <Trash2 size={14} color={colors.secondaryText} />
                <Text className="font-sans-semibold text-body-md text-secondary-text">
                  Remove
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text className="font-sans text-body-sm text-secondary-text">
                {group.kind === "error"
                  ? (group.message ?? "The download failed.")
                  : group.kind === "downloading"
                    ? `Downloading… ${group.percent}%`
                    : meta.tagline}
              </Text>
              {lowDisk ? (
                <Text className="storage-warning mt-2">
                  {`Not enough free space — ${meta.title} needs ${Math.round(
                    (meta.modelBytes * DISK_HEADROOM) / 1_000_000,
                  )} MB.`}
                </Text>
              ) : null}
            </View>
          )}
          {errorNote !== null ? (
            <Text className="mt-2 font-sans text-body-sm text-primary-text">{errorNote}</Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}