/** One downloadable voice engine.
 *
 * PocketPal's engine-group card, rebuilt on this app's stack: a collapsed
 * header that is a disclosure (logo, title, tier chip, specs, chevron) and
 * an expanded body that carries every action — install, pause/resume,
 * retry, or the curated voice rows — because that is where the reference
 * design puts them and where PocketPal's VoicePickerView puts them.
 *
 * The header keeps exactly one piece of state, the download arc: the
 * progress copy it would otherwise report lives in the body the guard
 * unmounts (see Motion). PocketPal makes the same trade on the same card —
 * VoicePickerView passes `ringProgress` to EngineLogo, which draws the arc
 * from that.
 *
 * Everything it renders comes from services/tts//engineMeta.ts (title, chip,
 * spec line, model id, size, voices) and services/tts//voiceUi.ts (which body the
 * state maps to, and the progress copy), so this file holds no engine
 * knowledge at all: adding a fourth engine is a table row, not a new
 * component.
 *
 * Motion: Reanimated's `Layout` animation at the app's one
 * duration/easing (utils/motion.ts). The body renders at natural
 * height and the mount/unmount animates the height on the UI thread,
 * with no manual measurement — `Layout` animates a child being ADDED
 * or REMOVED, which is why the body is mounted behind an `expanded`
 * guard. Rendered unconditionally it stays at natural height forever:
 * the chevron swaps and the card never closes.
 *
 * The chevron is a glyph swap (ChevronRight/ChevronDown), NOT a rotation:
 * SettingsRows' AdvancedGroup records that a style-rotated lucide icon
 * rendered invisible on device.
 */

import { Pressable, Text, View } from "react-native";
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

import { useColors } from "@/themes/tokens.ts";
import { motionLayout } from "@/utils/motion.ts";
import type { NeuralEngineId } from "@/services/tts/types.ts";
import { downloadLine } from "@/services/tts/voiceUi.ts";
import { useEngineCardController } from "@/hooks/use-engine-card-controller.ts";
import { ProgressRing } from "./progress-ring.tsx";
import { RadioDot } from "./radio-dot.tsx";

/** The engine's glyph. Lucide only — no bundled logo PNGs, which is what
 *  lets one card serve every engine. */
const ENGINE_ICON = { kitten: Cat, kokoro: AudioLines, supertonic: Gauge } as const;

/** Ring diameter. The glyph pill is 40, and the ring's own stroke eats 3 of
 *  that radius, so it needs 48 for the arc to clear the pill rather than sit
 *  on top of it (the reference gets its clearance from `ringPad` on the logo
 *  surface instead). */
const RING_SIZE = 48;

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
            ? "text-action"
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
  const colors = useColors();
  const c = useEngineCardController(engineId);
  const meta = c.meta;
  const currentVoice = c.currentVoice;
  const { expanded, setExpanded, previewingId, errorNote, setErrorNote } = c;
  const { installable, lowDisk, freeBytes, ringProgress, sizeMb } = c;
  const { track, onRemove, onTapVoice } = c;
  const {
    startEngineDownload,
    pauseEngineDownload,
    resumeEngineDownload,
  } = c;

  const Icon = ENGINE_ICON[engineId];
  const group = c.group;

  // The glyph block's two marks.
  const glyphColor = meta.warmBadge ? colors.warmAccent : colors.primary;
  const ringColor = meta.warmBadge ? colors.warmAccent : colors.primaryMark;

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
        <View className="h-12 w-12 items-center justify-center">
          <View
            className={
              meta.warmBadge
                ? "h-10 w-10 items-center justify-center rounded-full bg-orange-100"
                : "h-10 w-10 items-center justify-center rounded-full bg-surface-3"
            }
          >
            <Icon size={20} color={glyphColor} />
          </View>
          {/* The body owns the progress copy and the body is gone while the
              card is closed, so the header carries the arc — as PocketPal's
              EngineLogo does. `ringFraction` says when. */}
          {ringProgress !== null ? (
            <ProgressRing
              size={RING_SIZE}
              progress={ringProgress}
              color={ringColor}
              testID="engine-card-ring"
            />
          ) : null}
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

      {/* Collapsed means gone: the card is a disclosure, and the body's
          height is what `Layout` animates on the way in and out. */}
      {expanded ? (
        <Animated.View
          layout={motionLayout()}
        >
          <View className="voice-card__body">
            {group.kind === "ready" ? (
              <View>
                {engineId === "kokoro" ? (
                  <Text className="text-quiet">
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
                <Text className="mt-1 text-quiet">
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
                  <Text className="text-quiet">
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
      ) : null}
    </View>
  );
}