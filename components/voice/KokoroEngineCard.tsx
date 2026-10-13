/** Kokoro neural voice group (ticket 04 / spec Q12, Q15a, Q16).
 *
 * The one downloadable engine: PocketPal-structured group — identity
 * header, then a body that adapts to the download state (install card /
 * progress / error / the 11 curated voice rows). Tapping a voice selects
 * it and plays the canned preview through it; tapping the previewing
 * voice stops it. The tap decision is the pure `voiceTap` rule so the
 * component stays honest even for a stale render.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Download, Square, Volume2 } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";

import { KOKORO_BADGE, KOKORO_SPEC, KOKORO_TITLE, VOICE_PREVIEW_SAMPLE } from "../../constants/voice-strings.ts";
import { KOKORO_VOICES } from "../../lib/tts/engines/kokoro.ts";
import { kokoroGroupState, voiceTap } from "../../lib/tts/voiceUi.ts";
import type { Voice } from "../../lib/tts/types.ts";
import { useVoice } from "../../store/voice.ts";

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <View className="h-5 w-5 items-center justify-center rounded-full border-2 border-slate-400">
      {checked ? <View className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
    </View>
  );
}

function VoiceRow({
  voice,
  selected,
  previewing,
  onTap,
}: {
  voice: Voice;
  selected: boolean;
  previewing: boolean;
  onTap: (voice: Voice) => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={
        previewing ? `Stop previewing ${voice.name}` : `Speak with ${voice.name} and preview`
      }
      onPress={() => onTap(voice)}
      className="flex-row items-center gap-3 py-2"
    >
      <RadioDot checked={selected} />
      <Text className="flex-1 font-sans text-body-md text-primary-text">{voice.name}</Text>
      {previewing ? <Square size={14} color={colors.primary} /> : null}
    </Pressable>
  );
}

export function KokoroEngineCard() {
  const download = useVoice((s) => s.download);
  const currentVoice = useVoice((s) => s.currentVoice);
  const setCurrentVoice = useVoice((s) => s.setCurrentVoice);
  const startKokoroDownload = useVoice((s) => s.startKokoroDownload);
  const cancelKokoroDownload = useVoice((s) => s.cancelKokoroDownload);
  const play = useVoice((s) => s.play);
  const stop = useVoice((s) => s.stop);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [downloadErrorNote, setDownloadErrorNote] = useState<string | null>(null);

  const group = kokoroGroupState(download);

  function startDownload(): void {
    setDownloadErrorNote(null);
    void startKokoroDownload().catch((error: unknown) => {
      // The store triplet already carries reported failures; this only
      // covers a rejection the bridge never reported.
      setDownloadErrorNote(error instanceof Error ? error.message : String(error));
    });
  }

  function onTapVoice(voice: Voice): void {
    const outcome = voiceTap({ tapped: voice, currentVoice, previewingId, status: download });
    if (outcome.kind === "unavailable") return;
    if (outcome.kind === "stop-preview") {
      setPreviewingId(null);
      void stop();
      return;
    }
    setCurrentVoice(voice);
    setPreviewingId(voice.id);
    setDownloadErrorNote(null);
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
      <View className="voice-card__header">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="voice-card__title">{KOKORO_TITLE}</Text>
            <View className="voice-badge">
              <Text className="voice-badge__text">{KOKORO_BADGE}</Text>
            </View>
          </View>
          <Text className="voice-card__spec">{KOKORO_SPEC}</Text>
        </View>
      </View>
      <View className="voice-card__body">
        {group.kind === "install" ? (
          <>
            <Text className="font-sans text-body-sm text-secondary-text">
              A natural neural voice that runs fully on your device. One download, then it speaks offline.
            </Text>
            <View className="mt-3 flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download the Kokoro voice model"
                onPress={startDownload}
                className="btn btn--ghost flex-row items-center gap-2 px-5 py-2"
              >
                <Download size={16} color={colors.primary} />
                <Text className="font-sans-semibold text-body-md text-primary">Download</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {group.kind === "downloading" ? (
          <>
            <Text className="font-sans text-body-sm text-secondary-text">
              {`Downloading… ${group.percent}%`}
            </Text>
            <View className="mt-3 flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel the Kokoro download"
                onPress={() => cancelKokoroDownload()}
                className="btn btn--ghost px-5 py-2"
              >
                <Text className="font-sans-semibold text-body-md text-primary">Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {group.kind === "error" ? (
          <>
            <Text className="font-sans text-body-sm text-secondary-text">
              {group.message ?? "The download failed."}
            </Text>
            <View className="mt-3 flex-row">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry the Kokoro download"
                onPress={startDownload}
                className="btn btn--ghost px-5 py-2"
              >
                <Text className="font-sans-semibold text-body-md text-primary">Retry</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        {group.kind === "ready" ? (
          <View>
            {KOKORO_VOICES.map((voice) => (
              <VoiceRow
                key={voice.id}
                voice={voice}
                selected={currentVoice?.id === voice.id}
                previewing={previewingId === voice.id}
                onTap={onTapVoice}
              />
            ))}
            <View className="mt-1 flex-row items-center gap-2">
              <Volume2 size={14} color={colors.secondaryText} />
              <Text className="font-sans text-body-sm text-secondary-text">
                Tap a voice to select it and hear a sample.
              </Text>
            </View>
          </View>
        ) : null}
        {downloadErrorNote !== null ? (
          <Text className="mt-2 font-sans text-body-sm text-primary-text">{downloadErrorNote}</Text>
        ) : null}
      </View>
    </View>
  );
}
