/** One file of a Hugging Face repo, with its state and its actions.
 *
 * PocketParity: pocketpal-ai/src/screens/ModelsScreen/HFModelSearch/
 * DetailsView/ModelFileCard/ModelFileCard.tsx. Split out of the former
 * single-file HFModelSearch.tsx to mirror the reference's four-file shape
 * (HFModelSearch / SearchView / DetailsView / ModelFileCard).
 *
 * As in the reference, the row reads the store for its own state and owns
 * the sheet it opens: the vision pairing decision belongs to the file it
 * was made about. The parent passes the repo, the file and the siblings,
 * and hands down the two decisions it cannot make — the download itself,
 * and the unbookmark confirms.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Bookmark, ChevronRight, Eye, Lock, Trash2 } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { useModelStore } from "@/store/modelStore";
import { hfSpecId } from "@/services/models/huggingface.ts";
import { visionSizeBreakdown } from "@/services/models/hf-format.ts";
import { hfFileWarnings } from "@/services/models/hf-warnings.ts";
import { storageDisclosure } from "@/services/models/storage-disclosure.ts";
import type { HFWarningCode } from "@/services/models/hf-warnings.ts";
import type {
  HFModelFile,
  HFModelSearchResult,
  ModelDownloadStatus,
} from "@/types/models";
import {
  CancelDownloadButton,
  Chip,
  DownloadButton,
  DownloadProgressBar,
  confirmDeleteModel,
  formatBytes,
  isProgressVisible,
} from "./model-bits.tsx";
import {
  VisionDownloadSheet,
  type VisionDownloadChoice,
} from "./vision-download-sheet.tsx";

/** A warning chip's colour is its severity, so the four codes cannot be
 *  collapsed into one neutral pill: a full disk is not a legacy quant.
 *  Whole-string literals per branch: Uniwind compiles class names at build
 *  time and will not see a string assembled at runtime. */
function WarningChip({ code, label }: { code: HFWarningCode; label: string }) {
  return (
    <View
      className={
        code === "not-enough-space"
          ? "flex-row items-center rounded border px-2 py-1 bg-error/10 border-error/30"
          : code === "short-memory"
            ? "flex-row items-center rounded border px-2 py-1 bg-warning/10 border-warning/30"
            : "flex-row items-center rounded border px-2 py-1 bg-surface-2 border-border"
      }
    >
      <Text className="text-quiet">{label}</Text>
    </View>
  );
}

/** The destructive control's error ground, matching ModelCard's trash — what
 *  DESIGN.md documents for a destructive icon button. The 48dp floor comes
 *  from the shared `.icon-btn` class in global.css. */
const ICON_DESTRUCTIVE = "rounded-full bg-error/10";

export function HFFileRow({
  result,
  file,
  siblings,
  freeBytes,
  checked,
  onDownload,
  onUnbookmark,
  onWarn,
}: {
  result: HFModelSearchResult;
  file: HFModelFile;
  /** Every file in the repo: the projector pairing and the true footprint
   *  are properties of the repo, not of this row. */
  siblings: HFModelFile[];
  freeBytes: number | null;
  checked: boolean;
  onDownload: (file: HFModelFile, opts?: VisionDownloadChoice) => void;
  /** Unbookmarking asks questions (preset? downloaded?) the row cannot
   *  answer on its own, so the confirms live with the flow. */
  onUnbookmark: (oid: string) => void;
  /** The full warning list, for the snackbar the chip opens. */
  onWarn: (messages: string[]) => void;
}) {
  const colors = useColors();
  // Stable selectors: actions never change identity, so each subscribes
  // alone.
  const bookmarkModel = useModelStore((s) => s.bookmarkModel);
  const isBookmarked = useModelStore((s) => s.isBookmarked);
  const pauseModelDownload = useModelStore((s) => s.pauseModelDownload);
  const resumeModelDownload = useModelStore((s) => s.resumeModelDownload);
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload);
  const removeModel = useModelStore((s) => s.removeModel);
  const largestSuccessfulBytes = useModelStore((s) => s.largestSuccessfulBytes);

  // The vision download sheet is per-FILE: it decides the pair for one repo
  // file, so the file being configured is the sheet's whole state.
  const [visionSheetFile, setVisionSheetFile] = useState<HFModelFile | null>(
    null,
  );

  const specId = hfSpecId(result.modelId, file.name);
  // `find`, not `s.models`: the array's identity changes on any download
  // tick, which would re-render every visible row.
  const spec = useModelStore((s) => s.models.find((m) => m.id === specId));
  const status = (spec?.downloadStatus ?? "idle") as ModelDownloadStatus;
  const progress = spec?.downloadProgress ?? 0;
  const breakdown = visionSizeBreakdown(file, siblings);
  const bookmarked = file.oid ? isBookmarked(file.oid) : false;
  const warnings = hfFileWarnings({
    fileName: file.name,
    requiredBytes: breakdown.total,
    isVision: breakdown.isVision,
    hasProjector: breakdown.mmprojSize !== null,
    freeBytes,
    learnedCeilingBytes: largestSuccessfulBytes,
  });
  const fit = storageDisclosure({
    modelBytes: breakdown.llmSize,
    projectorBytes: breakdown.mmprojSize ?? 0,
    freeBytes,
    checked,
  });

  return (
    <View className="py-3 border-b border-border">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          {/* Middle ellipsis, PocketParity (ModelFileCard.tsx:281-288): a
              GGUF name carries its repo prefix, so the quantisation suffix
              is the informative end — and the name shares this row with two
              action buttons, which a wrap would push down. */}
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            className="font-sans text-body-md text-primary-text"
          >
            {file.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2 mt-2">
            <Chip label="GGUF" />
            {/* Names the file KIND and nothing else — constant by
                construction, since getModelFiles already filters to .gguf
                (services/models//huggingface.ts:562). Ours alone: the reference's
                file row has no such chip. Recorded in the 2026-10-12
                parity record, divergence 3. */}
            {/* A gated repo's file needs the HF token; without the chip a
                download 401s halfway (PocketParity: ModelFileCard.tsx
                :323-338). */}
            {result.gated ? (
              <View className="flex-row items-center gap-1 rounded bg-surface-2 px-2 py-0.5">
                <Lock size={10} color={colors.secondaryText} />
                <Text className="text-quiet">
                  Requires Token
                </Text>
              </View>
            ) : null}
            {/* Vision is a DECISION, not a label: it opens the sheet that
                downloads the pair (or deliberately skips it). The plain
                Download button beside it still takes the default. */}
            {breakdown.isVision ? (
              /* The pill is small; the target is not. DESIGN.md: "pad the
                 hit area, not the circle" — the same reason the destructive
                 icon button keeps a 48dp box. The reference's Paper Chip is
                 32dp; the 48dp floor is binding here. */
              <Pressable
                onPress={() => setVisionSheetFile(file)}
                className="min-h-12 flex-row items-center"
                accessibilityRole="button"
                accessibilityLabel={`Choose vision setup for ${file.name}`}
              >
                <View className="flex-row items-center gap-1 rounded bg-surface-2 px-2 py-0.5">
                  <Eye size={12} color={colors.primary} />
                  {/* The chip's whole job is answering "is vision already on
                      for this file?", so the label is the state word — the
                      reference's two labels, verbatim (ModelFileCard.tsx
                      :308-330). */}
                  <Text className="font-sans text-caption text-primary">
                    {spec?.visionEnabled ? "Vision enabled" : "Includes vision capability"}
                  </Text>
                  <ChevronRight size={12} color={colors.secondaryText} />
                </View>
              </Pressable>
            ) : null}
            {/* A vision model's real footprint is the pair, so the
                projector is priced into the number next to the button.
                Ours prints the pair; the reference prints only the total
                (ModelFileCard.tsx:265-283). More informative, one extra
                line at small widths — 2026-10-12 parity record, divergence
                4. */}
            <Text className="font-sans text-body-sm text-secondary-text-muted">
              {breakdown.mmprojSize !== null
                ? `${formatBytes(breakdown.llmSize)} + ${formatBytes(breakdown.mmprojSize)} projector`
                : formatBytes(file.size)}
            </Text>
            {fit.message ? (
              <Text className="storage-warning">
                {fit.message}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() =>
              bookmarked && file.oid
                ? onUnbookmark(file.oid)
                : bookmarkModel(result, file)
            }
            className="icon-btn"
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? `Remove bookmark for ${file.name}` : `Bookmark ${file.name}`}
            testID={`hf-bookmark-${file.name}`}
          >
            <Bookmark
              size={18}
              color={bookmarked ? colors.primary : colors.secondaryText}
              fill={bookmarked ? colors.primary : "none"}
            />
          </Pressable>
          {isProgressVisible(status) ? null : status === "completed" ? (
            /* Downloaded: the ONE action left is the destructive one. The
               reference turns its download glyph into the delete glyph in
               this state (ModelFileCard.tsx:196-224) rather than showing two
               controls, and the card's own trash already teaches what this
               glyph means. */
            <Pressable
              onPress={() =>
                confirmDeleteModel(() => void removeModel(specId))
              }
              className={`icon-btn ${ICON_DESTRUCTIVE}`}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${file.name}`}
            >
              <Trash2 size={16} color={colors.error} />
            </Pressable>
          ) : (
            <DownloadButton
              status={status}
              progress={progress}
              disabled={!fit.fits}
              onPress={() => onDownload(file)}
              onPause={() => void pauseModelDownload(specId)}
              onResume={() => void resumeModelDownload(specId)}
            />
          )}
        </View>
      </View>
      {warnings.length > 0 ? (
        /* ONE chip, not four. A full disk, a tight fit, a missing projector
           and a legacy quant can all fire for the same file, and the row has
           one line for them: as separate chips the worst case wrapped to
           three lines and pushed the row's own actions around. The count is
           the tell, the tap is the detail.
           PocketParity: ModelFileCard.tsx:295-306 (one chip, count when
           more) and the numbered snackbar it opens (:376-398). */
        <Pressable
          onPress={() => onWarn(warnings.map((w) => w.label))}
          className="mt-2 min-h-12 flex-row items-center self-start"
          accessibilityRole="button"
          accessibilityLabel={`Show ${warnings.length} download warning${warnings.length > 1 ? "s" : ""}`}
        >
          <WarningChip
            code={warnings[0].code}
            label={
              warnings.length > 1
                ? `${warnings.length} Warnings`
                : warnings[0].label
            }
          />
        </Pressable>
      ) : null}
      {isProgressVisible(status) ? (
        /* The shared bar, not the reference's Hugging Face yellow gradient
           wash (ModelFileCard.tsx:263-271). The gradient is a brand colour
           that exists nowhere in this design system, and
           tests/progress-bar.test.ts holds the line — 2026-10-12 parity
           record, divergence 2. */
        <>
          <DownloadProgressBar
            progress={progress}
            downloaded={spec?.downloadedBytes ?? 0}
            total={spec?.totalBytes ?? 0}
            speed={spec?.speedBytesPerSec}
          />
          <CancelDownloadButton onPress={() => void cancelModelDownload(specId)} />
        </>
      ) : null}

      {/* Always mounted so the dismiss animation plays on close;
          `visible` drives show/hide (D4-1). */}
      <VisionDownloadSheet
        visible={visionSheetFile !== null}
        file={visionSheetFile}
        siblings={siblings}
        onClose={() => setVisionSheetFile(null)}
        onConfirm={(chosen, opts) => onDownload(chosen, opts)}
      />
    </View>
  );
}
