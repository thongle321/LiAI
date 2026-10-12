/** The details half of the Hugging Face sheet: who published the repo, how
 * it is doing, and the files you can take.
 *
 * PocketParity: pocketpal-ai/src/screens/ModelsScreen/HFModelSearch/
 * DetailsView/DetailsView.tsx. Split out of the former single-file
 * HFModelSearch.tsx to mirror the reference's shape; the fixed header, the
 * stat chips and the projector filter are unchanged by the move.
 *
 * The free-space poll lives here rather than in the parent because this is
 * the sheet that must keep asking: the user may free space while looking at
 * the file list, and every row's Download button depends on the answer.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { ArrowLeft, Flame } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useSnackbar } from "../Snackbar.tsx";
import { useFreeSpacePoll } from "../../hooks/useStorageDisclosure.ts";
import { useLoadGuard } from "../../hooks/useLoadGuard.ts";
import { useModelStore } from "../../store/modelStore";
import {
  formatNumber,
  isVisionModel,
  timeAgo,
  visionSizeBreakdown,
} from "../../lib/models/hf-format.ts";
import { hfFileWarnings } from "../../lib/models/hf-warnings.ts";
import { Chip } from "./ModelBits.tsx";
import { HFFileRow } from "./HFFileRow.tsx";
import type { VisionDownloadChoice } from "./VisionDownloadSheet.tsx";
import type { HFModelFile, HFModelSearchResult } from "../../types/models";

function StatChip({
  label,
  trending = false,
}: {
  label: string;
  trending?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-1 rounded bg-surface-2 px-2 py-1">
      {trending ? <Flame size={11} color={colors.primary} /> : null}
      <Text className="font-sans text-caption text-secondary-text">{label}</Text>
    </View>
  );
}

/** Warnings are numbered here because they are a list the user has to act
 *  on, not one line of prose. Dismissal scales with the count so a long
 *  list is readable, PocketPal's 1000 + 2000ms per warning. */
function WarningSnackbar({
  warnings,
  onDone,
}: {
  warnings: string[];
  onDone: () => void;
}) {
  const { showSnackbar } = useSnackbar();
  useEffect(() => {
    showSnackbar(
      // Numbered when there is more than one: these are separate problems
      // to act on, and a bare newline reads them as prose.
      // PocketParity: ModelFileCard.tsx:388-392.
      warnings.length > 1
        ? warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")
        : warnings[0],
      {
        type: "warning",
        duration: 1000 + 2000 * warnings.length,
      },
    );
    const t = setTimeout(onDone, 1000 + 2000 * warnings.length);
    return () => clearTimeout(t);
  }, [warnings, onDone, showSnackbar]);

  return null;
}

export function HFDetailsView({
  result,
  files,
  filesLoading,
  onBack,
  onStartDownload,
}: {
  result: HFModelSearchResult;
  files: HFModelFile[];
  filesLoading: boolean;
  onBack: () => void;
  /** The download itself: this component owns the free-space reading and
   *  the learned ceiling, so it owns the warning and the guard too. */
  onStartDownload: (file: HFModelFile, opts?: VisionDownloadChoice) => void;
}) {
  const { freeBytes, checked } = useFreeSpacePoll(true);
  const largestSuccessfulBytes = useModelStore((s) => s.largestSuccessfulBytes);
  const getModelByOid = useModelStore((s) => s.getModelByOid);
  const removeBookmark = useModelStore((s) => s.removeBookmark);
  // ponytail: the shared ceiling gate, replacing the copy of it this file
  // used to carry inline (same predicate, same copy — hooks/useLoadGuard).
  const guard = useLoadGuard();
  const [warnings, setWarnings] = useState<string[] | null>(null);

  const isVision = isVisionModel(
    result.tags,
    files.map((f) => f.name),
  );
  // Projectors stay out of the FILE LIST: a standalone mmproj row would be
  // a download nothing can use, since a projector is only meaningful
  // paired to an LLM. They ARE reachable — the vision chip on each row
  // lists them as pairing choices for that file.
  const visibleFiles = files.filter(
    (f) => !f.name.toLowerCase().includes("mmproj"),
  );

  const handleDownload = (file: HFModelFile, opts?: VisionDownloadChoice) => {
    const breakdown = visionSizeBreakdown(file, files);
    const found = hfFileWarnings({
      fileName: file.name,
      requiredBytes: breakdown.total,
      isVision: breakdown.isVision,
      hasProjector: breakdown.mmprojSize !== null,
      freeBytes,
      learnedCeilingBytes: largestSuccessfulBytes,
    });
    if (found.length > 0) {
      setWarnings(found.map((w) => w.label));
    }
    // The pairing the sheet just decided rides along with the download.
    guard(breakdown.total, () => onStartDownload(file, opts));
  };

  /** Unbookmarking is not a plain toggle: a preset is not ours to remove,
   *  and a downloaded file has to be deleted before its entry can go.
   *  PocketParity: ModelFileCard.tsx:135-183 — the reference's three
   *  wordings, because the difference between them is the whole point. */
  const handleUnbookmark = (oid: string) => {
    const model = getModelByOid(oid);
    if (!model) return;
    if (model.origin === "preset") {
      Alert.alert("Cannot Remove", "The model is preset.");
      return;
    }
    if (model.downloadStatus === "completed") {
      Alert.alert(
        "Cannot Remove",
        "The model is downloaded. Please delete the file first.",
      );
      return;
    }
    Alert.alert(
      "Remove Model",
      "Are you sure you want to remove this model from the list?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            if (!removeBookmark(model.id)) {
              Alert.alert("Error", "Failed to remove the model.");
            }
          },
        },
      ],
    );
  };

  return (
    <View className="grow">
      {/* Fixed header above the list, PocketPal's DetailsView. */}
      <View className="pb-2">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onBack}
            className="h-12 w-12 items-center justify-center -ml-3"
            accessibilityRole="button"
            accessibilityLabel="Back to search results"
          >
            <ArrowLeft size={20} color={colors.secondaryText} />
          </Pressable>
          <Text className="flex-1 font-sans text-body-sm text-secondary-text-muted">
            {result.author}
          </Text>
          {isVision ? <Chip label="Vision" /> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-2 mt-2">
          {result.lastModified ? (
            <StatChip label={timeAgo(result.lastModified, Date.now(), true)} />
          ) : null}
          <StatChip label={`${formatNumber(result.downloads)} downloads`} />
          <StatChip label={`${formatNumber(result.likes)} likes`} />
          {result.trendingScore && result.trendingScore > 20 ? (
            <StatChip label="Trending" trending />
          ) : null}
        </View>
        <Text className="font-sans-semibold text-body-md text-primary-text mt-3 mb-1">
          {/* en.json `models.details.title`, verbatim — it names the file
              KIND, which is the whole difference between this list and a
              folder of repository files. */}
          Available GGUF Files
        </Text>
      </View>
      {filesLoading ? (
        <View className="flex-row items-center justify-center py-4">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          className="grow"
          data={visibleFiles}
          keyExtractor={(f) => f.name}
          renderItem={({ item: file }) => (
            <HFFileRow
              result={result}
              file={file}
              siblings={files}
              freeBytes={freeBytes}
              checked={checked}
              onDownload={handleDownload}
              onUnbookmark={handleUnbookmark}
              onWarn={setWarnings}
            />
          )}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {warnings ? (
        <WarningSnackbar
          warnings={warnings}
          onDone={() => setWarnings(null)}
        />
      ) : null}
    </View>
  );
}
