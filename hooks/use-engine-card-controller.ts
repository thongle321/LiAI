import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { formatBytes } from "@/services/models/progress.ts";
import { NEURAL_ENGINE_META } from "@/services/tts/engineMeta.ts";
import {
  canStartInstall,
  engineGroupState,
  ringFraction,
  voiceTap,
  type EngineGroupState,
} from "@/services/tts/voiceUi.ts";
import { useFreeSpacePoll } from "@/hooks/useStorageDisclosure.ts";
import type { NeuralEngineId, Voice } from "@/services/tts/types.ts";
import { VOICE_PREVIEW_SAMPLE } from "@/constants/voice-strings.ts";
import { useVoice } from "@/store/voice.ts";

/** PocketPal's disk preflight: the model must fit with 20% headroom. */
const DISK_HEADROOM = 1.2;

export function useEngineCardController(engineId: NeuralEngineId) {
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
  const playbackState = useVoice((s) => s.playbackState);

  const [expanded, setExpanded] = useState<boolean>(
    () => currentVoice?.engine === engineId,
  );
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const prevPlaybackMode = useRef(playbackState.mode);

  useEffect(() => {
    if (
      prevPlaybackMode.current === "playing" &&
      playbackState.mode === "idle" &&
      previewingId !== null
    ) {
      setPreviewingId(null);
    }
    prevPlaybackMode.current = playbackState.mode;
  }, [playbackState.mode, previewingId]);

  const group: EngineGroupState = engineGroupState(downloads[engineId]);

  const { freeBytes } = useFreeSpacePoll(group.kind !== "ready");

  const lowDisk =
    freeBytes !== null && freeBytes < meta.modelBytes * DISK_HEADROOM;
  const slotBusy = activeEngineId !== null && activeEngineId !== engineId;
  const installable = canStartInstall(group, slotBusy) && !lowDisk;

  const ringProgress = ringFraction(group);

  const sizeMb = Math.round(meta.modelBytes / 1_000_000);

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
    track(play(VOICE_PREVIEW_SAMPLE, { voice }));
  }

  return {
    meta,
    group,
    expanded,
    setExpanded,
    previewingId,
    errorNote,
    setErrorNote,
    installable,
    lowDisk,
    freeBytes,
    ringProgress,
    sizeMb,
    track,
    onRemove,
    onTapVoice,
    downloads,
    currentVoice,
    startEngineDownload,
    pauseEngineDownload,
    resumeEngineDownload,
    removeEngineModel,
    play,
    stop,
    setCurrentVoice,
  };
}
