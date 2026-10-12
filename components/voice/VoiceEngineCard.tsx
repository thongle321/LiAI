/** One downloadable engine on the Voice screen: a collapsed row that
 *  expands into either its download affordance or its voice list.
 *
 * PocketPal's VoicePickerView, restyled in this project's tokens — the
 * layout and the four-state body (not installed / downloading / error /
 * ready) are the reference's, the colours are ours.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { ChevronRight, Download, Play, Square, Trash2 } from "lucide-react-native";

import { ENGINE_ESTIMATED_BYTES, ENGINE_META, TTS_PREVIEW_SAMPLE } from "../../lib/tts/constants.ts";
import { requiredBytes } from "../../lib/tts/packPlan.ts";
import { getEngine } from "../../lib/tts/engineRegistry.ts";
import { speakReply, stopSpeaking } from "../../lib/voiceSpeak.ts";
import { engineBlockedByDisk, useTts, type EngineEntry } from "../../store/tts.ts";
import { useVoice } from "../../store/voice.ts";
import type { EngineId, Voice } from "../../lib/tts/types.ts";

const RING = 36;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Download progress as a ring around the engine mark. The collapsed row is
 *  only ~56pt tall, so this is the one progress affordance that fits. */
function ProgressRing({ progress, active }: { progress: number; active: boolean }) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View className="h-9 w-9 items-center justify-center">
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke="#e2e8f0"
          strokeWidth={STROKE}
          fill="none"
        />
        {clamped > 0 && (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={active ? "#2563eb" : "#3882f6"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE * clamped} ${CIRCUMFERENCE}`}
          />
        )}
      </Svg>
    </View>
  );
}

/** Play/stop for one voice. Tapping never selects — auditioning a voice
 *  should not change which voice replies use. */
function PreviewButton({ voice }: { voice: Voice }) {
  const [playing, setPlaying] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? `Stop preview of ${voice.name}` : `Preview ${voice.name}`}
      hitSlop={12}
      onPress={() => {
        if (playing) {
          stopSpeaking();
          setPlaying(false);
          return;
        }
        setPlaying(true);
        speakReply(TTS_PREVIEW_SAMPLE, {
          onDone: () => setPlaying(false),
          onStopped: () => setPlaying(false),
          onError: () => setPlaying(false),
        });
      }}
    >
      {playing ? (
        <Square size={18} color="#2563eb" fill="#2563eb" />
      ) : (
        <Play size={18} color="#2563eb" />
      )}
    </Pressable>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <View
      className="h-5 w-5 items-center justify-center rounded-full"
      style={{ borderWidth: 2, borderColor: selected ? "#2563eb" : "#cbd5e1" }}
    >
      {selected && <View className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
    </View>
  );
}

export function VoiceEngineCard({ engine }: { engine: EngineId }) {
  const meta = ENGINE_META[engine];
  const entry = useTts((s) => s.engines[engine]) as EngineEntry;
  const freeBytes = useTts((s) => s.freeBytes);
  const download = useTts((s) => s.download);
  const remove = useTts((s) => s.remove);
  const voicesFor = useTts((s) => s.voicesFor);
  const currentVoice = useVoice((s) => s.currentVoice);
  const [expanded, setExpanded] = useState(false);

  const ready = entry.state === "ready";
  const downloading = entry.state === "downloading";
  const blocked = !ready && engineBlockedByDisk(freeBytes, engine);
  const active = currentVoice?.engine === engine;
  const voices = ready ? voicesFor(engine) : [];
  const megabytes = Math.round(ENGINE_ESTIMATED_BYTES[engine] / (1024 * 1024));

  return (
    <View className="voice-card mb-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${meta.title}, ${meta.badge.toLowerCase()}`}
        onPress={() => setExpanded(!expanded)}
        className="voice-card__header"
      >
        <ProgressRing progress={downloading ? entry.progress : ready ? 1 : 0} active={active} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="voice-card__title">{meta.title}</Text>
            <View className={`voice-badge${engine === "kitten" ? " voice-badge--warm" : ""}`}>
              <Text className="voice-badge__text">{meta.badge}</Text>
            </View>
          </View>
          <Text className="voice-card__spec">
            {meta.voices} voices · {megabytes} MB · ~{meta.ramMb} MB RAM
          </Text>
        </View>
        {ready && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${meta.title}`}
            hitSlop={12}
            onPress={() => void remove(engine)}
          >
            <Trash2 size={18} color="#64748b" />
          </Pressable>
        )}
        <ChevronRight
          size={22}
          color="#64748b"
          style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
        />
      </Pressable>

      {expanded && (
        <View className="voice-card__body">
          {downloading && (
            <Text className="voice-card__spec">
              {`Downloading…  ${Math.round(entry.progress * 100)}%  ·  ${Math.round(
                ENGINE_ESTIMATED_BYTES[engine] * entry.progress,
              )} / ${megabytes} MB`}
            </Text>
          )}

          {entry.state === "not_installed" && (
            <View className="gap-3">
              <Text className="voice-card__spec">
                Voice packs are stored on this device. Downloaded voices work offline.
              </Text>
              {blocked && (
                <Text className="voice-card__spec">
                  {`Not enough space — free up ${Math.round(requiredBytes(engine) / (1024 * 1024))} MB to install this engine.`}
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Download ${meta.title}`}
                disabled={blocked}
                onPress={() => void download(engine)}
                className="btn btn--secondary"
              >
                <Download size={16} color="#2563eb" />
                <Text className="btn-label">{`Download · ${megabytes} MB`}</Text>
              </Pressable>
            </View>
          )}

          {entry.state === "error" && (
            <View className="gap-3">
              <Text className="voice-card__spec">{entry.error ?? "Download failed."}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry ${meta.title} download`}
                onPress={() => void download(engine)}
                className="btn btn--secondary"
              >
                <Text className="btn-label">Try again</Text>
              </Pressable>
            </View>
          )}

          {ready && voices.length === 0 && (
            <Text className="voice-card__spec">No voices found in this pack.</Text>
          )}

          {ready &&
            voices.map((voice) => {
              const selected = currentVoice?.engine === engine && currentVoice.id === voice.id;
              return (
                <Pressable
                  key={`${engine}:${voice.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={voice.name}
                  onPress={async () => {
                    // Only a pack we can actually drive counts as selectable.
                    if (!getEngineSafe(engine)) return;
                    useVoice.getState().setVoice(voice);
                    setExpanded(false);
                  }}
                  className="voice-option"
                >
                  <Radio selected={selected} />
                  <Text
                    className={`voice-option__name${selected ? " voice-option__name--selected" : ""} flex-1`}
                  >
                    {voice.name}
                  </Text>
                  <PreviewButton voice={voice} />
                </Pressable>
              );
            })}
        </View>
      )}
    </View>
  );
}

/** Neural engines have no implementation yet, so their voices cannot be
 *  spoken. Returns null rather than throwing on a tap that would fail. */
function getEngineSafe(engine: EngineId) {
  try {
    return getEngine(engine);
  } catch {
    return null;
  }
}