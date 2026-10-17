/** One downloadable voice engine.
 *
 * PocketPal's engine-group card, rebuilt on this app's stack: a collapsed
 * header that is purely a disclosure (logo, title, tier chip, specs,
 * chevron) and an expanded body that carries every action — install,
 * pause/resume, retry, or the curated voice rows — because that is where
 * the reference design puts them and where PocketPal's VoicePickerView
 * puts them.
 *
 * Everything it renders comes from services/tts//engineMeta.ts (title, chip,
 * spec line, model id, size, voices) and services/tts//voiceUi.ts (which body the
 * state maps to, and the progress copy), so this file holds no engine
 * knowledge at all: adding a fourth engine is a table row, not a new
 * component.
 *
 * Motion: Reanimated's `Layout` animation at the app's one
 * duration/easing (utils/motion.ts). The expanded height and opacity
 * animate on the UI thread with no manual measurement — the body
 * simply renders at natural height and `Layout` animates the change.
 *
 * The chevron is a glyph swap (ChevronRight/ChevronDown), NOT a rotation:
 * SettingsRows' AdvancedGroup records that a style-rotated lucide icon
 * rendered invisible on device.
 */

import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  AudioLines,
  Cat,
  ChevronDown,
  ChevronRight,
  Download,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { motionLayout } from "../../utils/motion.ts";
import { formatBytes } from "../../services/models/progress.ts";
import { NEURAL_ENGINE_META } from "../../services/tts/engineMeta.ts";
import {
  canStartInstall,
  downloadLine,
  engineGroupState,
  voiceTap,
  type EngineGroupState,
} from "../../services/tts/voiceUi.ts";
import { useFreeSpacePoll } from "../../hooks/useStorageDisclosure.ts";
import type { NeuralEngineId, Voice } from "../../services/tts/types.ts";
import { VOICE_PREVIEW_SAMPLE } from "../../constants/voice-strings.ts";
import { useVoice } from "../../store/voice.ts";
import { RadioDot } from "./radio-dot.tsx";

/** The engine's glyph. Lucide only — no bundled logo PNGs, which is what
 *  lets one card serve every engine. */
const ENGINE_ICON = { kitten: Cat, kokoro: AudioLines, supertonic: Gauge } as const;

/** PocketPal's disk preflight: the model must fit with 20% headroom. */
const DISK_HEADROOM = 1.2;

/** A full-width body action. `tone` is the only difference between the four
 *  buttons the card can show. */
function Action({
  tone,
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  tone: "primary" | "secondary" | "disabled";
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={tone === "disabled"}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={
        tone === "primary"
          ? "voice-action voice-action--primary mt-3"
          : tone === "secondary"
            ? "voice-action voice-action--secondary mt-3"
            : "voice-action voice-action--disabled mt-3"
      }
    >
      {icon}
      <Text
        className={
          tone === "primary"
            ? "font-sans-semibold text-body-md text-on-primary"
            : tone === "secondary"
              ? "font-sans-semibold text-body-md text-primary"
              : "font-sans-semibold text-body-md text-secondary-text"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EngineCard({ engineId }: { engineId: NeuralEngineId }) {
  const meta = NEURAL_ENGINE_META[engineId];
  const downloads = useVoice((s) => s.downloads);
  const activeEngineId = useVoice((s) => s.activeEngineId);
  const currentVoice = useVoice((s) => s.currentVoice);
  const setCurrentVoice = useVoice((s) => s.setCurrentVoice);
  const startEngineDownload = useVoice((s) => s.startEngineDownload);
  const pauseEngineDownload = useVoice((s) => s.pauseEngineDownload);
  const resumeEngineDownload = useVoice((s) => s.resumeEngineDownload);
  const removeEngineModel = useVoice((s) => s.removeEngineModel);
  const play = useVoice((s) => s.play);
  const stop = useVoice((s) => s.stop);

  const [expanded, setExpanded] = useState(
    () => currentVoice?.engine === engineId,
  );
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const group: EngineGroupState = engineGroupState(downloads[engineId]);
  const Icon = ENGINE_ICON[engineId];
  const sizeMb = Math.round(meta.modelBytes / 1_000_000);

  // Free space only matters while there is something to download; a ready
  // engine has no Install button and needs no preflight. The shared hook
  // owns the read and the interval — no second poller here.
  const { freeBytes } = useFreeSpacePoll(group.kind !== "ready");

  const lowDisk = freeBytes !== null && freeBytes < meta.modelBytes * DISK_HEADROOM;
  // The download runtime is single-slot: an in-flight engine owns it, so
  // this card waits rather than fighting it for the same controller.
  const slotBusy = activeEngineId !== null && activeEngineId !== engineId;
  const installable = canStartInstall(group, slotBusy) && !lowDisk;

  // Every failure the bridge already reported (network, disk, checksum) is
  // a status the body renders; this only covers a rejection it never saw.
  function track(promise: Promise<unknown>): void {
    promise.catch((error: unknown) => {
      setErrorNote(error instanceof Error ? error.message : String(error));
    });
  }

  function onRemove(): void {
    Alert.alert(
      `Remove ${meta.title}?`,
      `This frees ${formatBytes(meta.modelBytes, 0)} on your device. You can download it again at any time.`,
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
            track(removeEngineModel(engineId));
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
    track(
      play(VOICE_PREVIEW_SAMPLE, { voice }).finally(() => {
        setPreviewingId((id) => (id === voice.id ? null : id));
      }),
    );
  }

  function renderAction() {
    if (group.kind === "ready") return null;
    if (group.kind === "downloading") {
      return (
        <Action
          tone="secondary"
          icon={<Pause size={16} color={colors.primary} />}
          label="Pause"
          accessibilityLabel={`Pause the ${meta.title} download — the downloaded files are kept`}
          onPress={() => {
            setErrorNote(null);
            track(pauseEngineDownload(engineId));
          }}
        />
      );
    }
    if (group.kind === "paused") {
      return (
        <Action
          tone="secondary"
          icon={<Play size={16} color={colors.primary} />}
          label="Resume"
          accessibilityLabel={`Resume the ${meta.title} download`}
          onPress={() => {
            setErrorNote(null);
            track(resumeEngineDownload(engineId));
          }}
        />
      );
    }
    if (group.kind === "error") {
      return (
        <Action
          tone="primary"
          icon={<RotateCcw size={16} color={colors.onPrimary} />}
          label="Retry"
          accessibilityLabel={`Retry the ${meta.title} download`}
          onPress={() => {
            setErrorNote(null);
            track(startEngineDownload(engineId));
          }}
        />
      );
    }
    const icon = installable ? (
      <Download size={16} color={installable ? colors.onPrimary : colors.secondaryText} />
    ) : null;
    return (
      <Action
        tone={installable ? "primary" : "disabled"}
        icon={icon}
        label={`Install · ${sizeMb} MB`}
        accessibilityLabel={
          lowDisk
            ? `Not enough free space to install ${meta.title}`
            : `Install the ${meta.title} voice model, ${sizeMb} megabytes`
        }
        onPress={() => {
          setErrorNote(null);
          track(startEngineDownload(engineId));
        }}
      />
    );
  }

  return (
    <View className="voice-card mb-3">
      {/* Collapsed header — the card itself is the disclosure, so it has no
          action of its own: every action needs the body open. */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${meta.title} — ${meta.spec}`}
        className="voice-card__header"
      >
        <View
          className={
            meta.warmBadge
              ? "h-10 w-10 items-center justify-center rounded-full bg-orange-100"
              : "h-10 w-10 items-center justify-center rounded-full bg-surface-3"
          }
        >
          <Icon size={20} color={meta.warmBadge ? colors.warmAccent : colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="voice-card__title">{meta.title}</Text>
          <View className={meta.warmBadge ? "voice-badge voice-badge--warm" : "voice-badge"}>
            <Text className={meta.warmBadge ? "voice-badge__text text-warm-accent" : "voice-badge__text"}>{meta.badge}</Text>
          </View>
          <Text className="voice-card__spec">{meta.spec}</Text>
        </View>
        {expanded ? (
          <ChevronDown size={16} color={colors.secondaryText} />
        ) : (
          <ChevronRight size={16} color={colors.secondaryText} />
        )}
      </Pressable>

      <Animated.View
        layout={motionLayout()}
      >
        <View className="voice-card__body">
          {group.kind === "ready" ? (
            <View>
              {engineId === "kokoro" ? (
                <Text className="font-sans text-body-sm text-secondary-text">
                  Some voices may not work on all devices.
                </Text>
              ) : null}
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
                className="btn btn--ghost active:opacity-80 mt-3 flex-row items-center gap-2 px-5 py-2"
              >
                <Trash2 size={14} color={colors.secondaryText} />
                <Text className="font-sans-semibold text-body-md text-secondary-text">
                  Remove
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {group.kind === "error" ? (
                <Text className="font-sans text-body-sm text-error">
                  {group.message ?? "The download failed."}
                </Text>
              ) : (
                <Text className="font-sans text-body-sm text-secondary-text">
                  {downloadLine(group, meta.modelBytes) ?? meta.tagline}
                </Text>
              )}
              {lowDisk && group.kind === "install" ? (
                <Text className="storage-warning mt-2">
                  {`Not enough space — free up ${Math.round(
                    (meta.modelBytes * DISK_HEADROOM) / 1_000_000,
                  )} MB to install this engine (${Math.floor((freeBytes ?? 0) / 1_000_000)} MB available).`}
                </Text>
              ) : null}
              {renderAction()}
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