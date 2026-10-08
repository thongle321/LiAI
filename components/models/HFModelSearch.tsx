/** Add a model from Hugging Face.
 *
 * PocketParity with PocketPal's HFModelSearch + DetailsView: two stacked
 * sheets — search underneath, file detail on top — a search bar carrying
 * its own sort and author filter sheets,
 * paging from the Hub's Link header, per-file bookmarks, storage-gated
 * downloads and the four warning chips.
 *
 * The sheet is components/Sheet.tsx, not @expo/ui's native sheet: that
 * one is already rejected in Sheet.tsx's header (no window insets, an
 * Android snap that collapses to half/full, and a pan gesture that eats
 * the list's scroll).
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Lock,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { Sheet } from "../Sheet.tsx";
import { useSnackbar } from "../Snackbar.tsx";
import { colors } from "../../themes/tokens.ts";
import { useShallow } from "zustand/shallow";
import { useModelStore } from "../../store/modelStore";
import { hfSpecId } from "../../lib/models/huggingface.ts";
import {
  extractHFModelTitle,
  formatNumber,
  isVisionModel,
  timeAgo,
  visionSizeBreakdown,
} from "../../lib/models/hf-format.ts";
import { hfFileWarnings } from "../../lib/models/hf-warnings.ts";
import type { HFWarningCode } from "../../lib/models/hf-warnings.ts";
import type { HFModelFile, HFModelSearchResult, ModelDownloadStatus } from "../../types/models";
import {
  CancelDownloadButton,
  Chip,
  DownloadButton,
  DownloadProgressBar,
  ModelTypeIcon,
  formatBytes,
  isProgressVisible,
} from "./ModelBits.tsx";
import {
  VisionDownloadSheet,
  type VisionDownloadChoice,
} from "./VisionDownloadSheet.tsx";

const SORT_OPTIONS: { value: "relevance" | "downloads" | "lastModified" | "likes"; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "lastModified", label: "Last modified" },
  { value: "likes", label: "Likes" },
];

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
      <Text className="font-sans text-caption text-secondary-text">{label}</Text>
    </View>
  );
}

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

function SearchErrorSnackbar({
  error,
  onRetry,
}: {
  error: { message: string } | null;
  onRetry: () => void;
}) {
  const { showSnackbar } = useSnackbar();
  useEffect(() => {
    if (!error) return;
    showSnackbar(error.message, {
      type: "error",
      duration: 8000,
      action: { label: "Retry", onPress: onRetry },
    });
  }, [error, onRetry, showSnackbar]);
  return null;
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
    showSnackbar(warnings.join("\n"), {
      type: "warning",
      duration: 1000 + 2000 * warnings.length,
    });
    const t = setTimeout(onDone, 1000 + 2000 * warnings.length);
    return () => clearTimeout(t);
  }, [warnings, onDone, showSnackbar]);

  return null;
}

function SortSheet({
  visible,
  active,
  onPick,
  onClose,
}: {
  visible: boolean;
  active: string;
  onPick: (value: "relevance" | "downloads" | "lastModified" | "likes") => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Sort by" testID="hf-sort-sheet">
      {SORT_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => {
            onPick(option.value);
            onClose();
          }}
          className="min-h-12 flex-row items-center justify-between py-3 border-b border-border"
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${option.label}`}
        >
          <Text className="font-sans text-body-lg text-primary-text">{option.label}</Text>
          {active === option.value ? (
            <CheckCircle2 size={20} color={colors.primary} />
          ) : null}
        </Pressable>
      ))}
    </Sheet>
  );
}

function AuthorSheet({
  visible,
  author,
  onApply,
  onClose,
}: {
  visible: boolean;
  author: string;
  onApply: (author: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(author);
  useEffect(() => {
    if (visible) setDraft(author);
  }, [visible, author]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter by author" testID="hf-author-sheet">
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="e.g. bartowski"
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.secondaryText}
        accessibilityLabel="Author name"
        className="font-sans text-body-lg text-primary-text bg-surface-1 border border-border rounded-lg px-5 py-3"
      />
      <View className="flex-row gap-2 pt-4">
        <Pressable
          onPress={() => {
            onApply("");
            onClose();
          }}
          className="min-h-12 flex-1 items-center justify-center rounded-lg border border-border py-3"
          accessibilityRole="button"
          accessibilityLabel="Clear author filter"
        >
          <Text className="font-sans text-body-md text-primary">Clear</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            onApply(draft.trim());
            onClose();
          }}
          className="min-h-12 flex-1 items-center justify-center rounded-lg bg-primary py-3"
          accessibilityRole="button"
          accessibilityLabel="Apply author filter"
        >
          <Text className="font-sans-semibold text-body-md text-on-primary">Apply</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

export function HFModelSearch({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // Stable selectors: actions are referentially stable, but useShallow
  // keeps the two re-rendering subscriptions (models, largestBytes)
  // isolated — a bookmark toggle must not rebuild the search list.
  const searchModels = useModelStore((s) => s.searchModels);
  const loadMoreModels = useModelStore((s) => s.loadMoreModels);
  const loadSearchFilters = useModelStore((s) => s.loadSearchFilters);
  const searchResults = useModelStore((s) => s.searchResults);
  const searchLoading = useModelStore((s) => s.searchLoading);
  const searchLoadingMore = useModelStore((s) => s.searchLoadingMore);
  const searchError = useModelStore((s) => s.searchError);
  const searchQuery = useModelStore((s) => s.searchQuery);
  const searchFilters = useModelStore((s) => s.searchFilters);
  const setSearchFilters = useModelStore((s) => s.setSearchFilters);
  const getModelFiles = useModelStore((s) => s.getModelFiles);
  const disableHfTokenAndRetry = useModelStore(
    (s) => s.disableHfTokenAndRetry,
  );
  const bookmarkModel = useModelStore((s) => s.bookmarkModel);
  const isBookmarked = useModelStore((s) => s.isBookmarked);
  const getModelByOid = useModelStore((s) => s.getModelByOid);
  const removeBookmark = useModelStore((s) => s.removeBookmark);
  const startDownload = useModelStore((s) => s.startDownload);
  const pauseModelDownload = useModelStore((s) => s.pauseModelDownload);
  const resumeModelDownload = useModelStore((s) => s.resumeModelDownload);
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload);
  const { models, largestSuccessfulBytes } = useModelStore(
    useShallow((s) => ({
      models: s.models,
      largestSuccessfulBytes: s.largestSuccessfulBytes,
    })),
  );
  const activeHfToken = useModelStore((s) => s.activeHfToken);
  const guard = (sizeBytes: number, proceed: () => void) => {
    if (sizeBytes > largestSuccessfulBytes * 1.5 && largestSuccessfulBytes > 0) {
      Alert.alert(
        "Large model",
        "This file is much larger than models that have downloaded successfully on this device. It may fail or run out of memory.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Download anyway", onPress: proceed },
        ],
      );
      return;
    }
    proceed();
  };
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HFModelSearchResult | null>(null);
  const [files, setFiles] = useState<HFModelFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [snackWarnings, setSnackWarnings] = useState<string[] | null>(null);
  // The vision download sheet is per-FILE: it decides the pair for one
  // repo file, so the file being configured is the sheet's whole state.
  const [visionSheetFile, setVisionSheetFile] = useState<HFModelFile | null>(
    null,
  );
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  // Bumped by the filter sheets so the debounce effect re-runs: the store
  // holds the filters, and its identity never changes.
  const [filtersVersion, setFiltersVersion] = useState(0);
  // Filters hydrate from storage once per open, BEFORE the first search,
  // or a returning user's sort would be ignored by that request.
  const hydrated = useRef(false);

  useEffect(() => {
    if (!visible) {
      hydrated.current = false;
      setSelected(null);
      return;
    }
    // ponytail: debounce, PocketParity's 500ms.
    const t = setTimeout(() => {
      void (async () => {
        if (!hydrated.current) {
          hydrated.current = true;
          await loadSearchFilters();
        }
        await searchModels(query);
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [query, visible, filtersVersion, loadSearchFilters, searchModels]);

  const applyFilters = (patch: Parameters<typeof setSearchFilters>[0]) => {
    setSearchFilters(patch);
    setFiltersVersion((v) => v + 1);
  };

  const openDetails = async (result: HFModelSearchResult) => {
    setSelected(result);
    setFiles([]);
    setFilesLoading(true);
    setFreeBytes(null);
    try {
      const [loaded, free] = await Promise.all([
        getModelFiles(result.modelId),
        // Free disk is best-effort: a null means "unknown", which must
        // never disable the download button.
        getFreeDiskStorageAsync().catch(() => null),
      ]);
      setFiles(loaded);
      setFreeBytes(free);
    } catch (error) {
      console.error("Failed to load model files:", error);
    } finally {
      setFilesLoading(false);
    }
  };

  const closeDetails = () => {
    setSelected(null);
    setFiles([]);
    setSnackWarnings(null);
  };

  const onDownload = (
    result: HFModelSearchResult,
    file: HFModelFile,
    opts?: VisionDownloadChoice,
  ) => {
    const breakdown = visionSizeBreakdown(file, files);
    const warnings = hfFileWarnings({
      fileName: file.name,
      requiredBytes: breakdown.total,
      isVision: breakdown.isVision,
      hasProjector: breakdown.mmprojSize !== null,
      freeBytes,
      learnedCeilingBytes: largestSuccessfulBytes,
    });
    if (warnings.length > 0) {
      setSnackWarnings(warnings.map((w) => w.label));
    }
    guard(breakdown.total, () => {
      void startDownload(
        result.modelId,
        file,
        activeHfToken() ?? undefined,
        opts,
      );
    });
  };

  const onUnbookmark = (oid: string | undefined) => {
    if (!oid) return;
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

  const isVision = selected
    ? isVisionModel(selected.tags, files.map((f) => f.name))
    : false;
  // Projectors stay out of the FILE LIST: a standalone mmproj row would be
  // a download nothing can use, since a projector is only meaningful
  // paired to an LLM. They ARE reachable — the Vision sheet above lists
  // them as pairing choices for this file.
  const visibleFiles = files.filter(
    (f) => !f.name.toLowerCase().includes("mmproj"),
  );

  const renderFile = ({ item: file }: { item: HFModelFile }) => {
    const result = selected!;
    const specId = hfSpecId(result.modelId, file.name);
    const spec = models.find((m) => m.id === specId);
    const status = (spec?.downloadStatus ?? "idle") as ModelDownloadStatus;
    const progress = spec?.downloadProgress ?? 0;
    const breakdown = visionSizeBreakdown(file, files);
    const bookmarked = file.oid ? isBookmarked(file.oid) : false;
    const warnings = hfFileWarnings({
      fileName: file.name,
      requiredBytes: breakdown.total,
      isVision: breakdown.isVision,
      hasProjector: breakdown.mmprojSize !== null,
      freeBytes,
      learnedCeilingBytes: largestSuccessfulBytes,
    });
    const outOfSpace = freeBytes !== null && breakdown.total > freeBytes;

    return (
      <View className="py-3 border-b border-border">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-1">
            <Text className="font-sans text-body-md text-primary-text">{file.name}</Text>
            <View className="flex-row flex-wrap items-center gap-2 mt-2">
              <Chip label="GGUF" />
              {/* Vision is a DECISION, not a label: it opens the sheet that
                  downloads the pair (or deliberately skips it). The plain
                  Download button beside it still takes the default. */}
              {breakdown.isVision ? (
                <Pressable
                  onPress={() => setVisionSheetFile(file)}
                  className="min-h-8 rounded bg-surface-2 px-2 py-0.5"
                  accessibilityRole="button"
                  accessibilityLabel={`Choose vision setup for ${file.name}`}
                >
                  <Text className="font-sans text-caption text-primary">
                    Vision
                  </Text>
                </Pressable>
              ) : null}
              {/* A vision model's real footprint is the pair, so the
                  projector is priced into the number next to the button. */}
              <Text className="font-sans text-body-sm text-secondary-text/70">
                {breakdown.mmprojSize !== null
                  ? `${formatBytes(breakdown.llmSize)} + ${formatBytes(breakdown.mmprojSize)} projector`
                  : formatBytes(file.size)}
              </Text>
              {outOfSpace ? (
                <Text className="font-sans text-caption text-error">
                  {`Only ${formatBytes(freeBytes ?? 0)} free`}
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
              className="h-12 w-12 items-center justify-center"
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
            {isProgressVisible(status) ? (
              <CancelDownloadButton
                onPress={() => void cancelModelDownload(specId)}
              />
            ) : (
              <DownloadButton
                status={status}
                progress={progress}
                disabled={outOfSpace || status === "completed"}
                onPress={() => onDownload(result, file)}
                onPause={() => void pauseModelDownload(specId)}
                onResume={() => void resumeModelDownload(specId)}
              />
            )}
          </View>
        </View>
        {warnings.length > 0 ? (
          <View className="flex-row flex-wrap gap-2 mt-2">
            {warnings.map((w) => (
              <WarningChip key={w.code} code={w.code} label={w.label} />
            ))}
          </View>
        ) : null}
        {isProgressVisible(status) ? (
          <DownloadProgressBar
            progress={progress}
            downloaded={spec?.downloadedBytes ?? 0}
            total={spec?.totalBytes ?? 0}
            speed={spec?.speedBytesPerSec}
          />
        ) : null}
      </View>
    );
  };

  const renderResult = ({ item: result }: { item: HFModelSearchResult }) => (
    <Pressable
      onPress={() => void openDetails(result)}
      className="py-3 border-b border-border"
      accessibilityRole="button"
      accessibilityLabel={`${result.name} by ${result.author}`}
      testID={`hf-result-${result.modelId}`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-2">
            <ModelTypeIcon
              type={isVisionModel(result.tags, result.ggufFiles.map((f) => f.name)) ? "vision" : "llm"}
            />
            <Text className="flex-1 font-sans-semibold text-body-md text-primary-text">
              {extractHFModelTitle(result.modelId)}
            </Text>
          </View>
          <Text className="font-sans text-body-sm text-secondary-text/70 mt-1">
            {`by ${result.author}`}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.secondaryText} />
      </View>
      <View className="flex-row flex-wrap items-center gap-2 mt-2">
        <Text className="font-sans text-body-sm text-secondary-text/70">
          {result.lastModified ? timeAgo(result.lastModified, Date.now(), false) : ""}
        </Text>
        <Text className="font-sans text-body-sm text-secondary-text/70">
          {`${formatNumber(result.downloads)} downloads`}
        </Text>
        <Text className="font-sans text-body-sm text-secondary-text/70">
          {`${formatNumber(result.likes)} likes`}
        </Text>
        {result.gated ? (
          <View className="flex-row items-center gap-1 px-2 py-1 bg-surface-2 border border-border rounded">
            <Lock size={10} color={colors.secondaryText} />
            <Text className="font-sans text-caption text-secondary-text">
              Requires Token
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  // Two stacked sheets, PocketPal's HFModelSearch shape on our Sheet: the
  // search sheet stays mounted underneath — query, results and scroll
  // intact — while the details sheet covers it. Back arrow closes details
  // only; the search X closes everything.
  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Add from Hugging Face"
        scrollable={false}
        testID="hf-search-sheet"
      >
        <View className="grow">
          {/* PocketPal EnhancedSearchBar layout: search pill on top, filter
              chips (author + sort) in a horizontal scroll below. */}
          <View className="pb-3">
            <View className="flex-row items-center gap-2 bg-surface-1 border border-border rounded-full px-4">
              <Search size={16} color={colors.secondaryText} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search models (e.g., llama, qwen, gemma)"
                placeholderTextColor={colors.secondaryText}
                accessibilityLabel="Search Hugging Face models"
                className="flex-1 font-sans text-body-lg text-primary-text py-3"
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery("")}
                  className="h-8 w-8 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X size={16} color={colors.secondaryText} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pt-2">
              <Pressable
                onPress={() => setAuthorOpen(true)}
                className={`flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                  searchFilters.author
                    ? " bg-surface-3"
                    : " border border-border"
                }`}
                accessibilityRole="button"
                accessibilityLabel={`Filter by author${searchFilters.author ? `, ${searchFilters.author}` : ""}`}
              >
                <Text className={`font-sans text-body-sm ${
                  searchFilters.author ? "text-primary font-sans-medium" : "text-secondary-text"
                }`}>
                  {searchFilters.author || "Author"}
                </Text>
                <ChevronDown size={14} color={searchFilters.author ? colors.primary : colors.secondaryText} />
              </Pressable>
              <Pressable
                onPress={() => setSortOpen(true)}
                className={`ml-2 flex-row items-center gap-1 rounded-full px-3 py-1.5 ${
                  "border border-border"
                }`}
                accessibilityRole="button"
                accessibilityLabel="Sort results"
              >
                <Text className="font-sans text-body-sm text-secondary-text">
                  {SORT_OPTIONS.find((o) => o.value === searchFilters.sortBy)?.label ?? "Sort"}
                </Text>
                <ChevronDown size={14} color={colors.secondaryText} />
              </Pressable>
            </ScrollView>
          </View>

          {searchError ? (
            <View className="pb-3">
              <Text className="font-sans text-body-sm text-error">
                {searchError.message}
              </Text>
              {searchError.code === "authentication" ? (
                <Pressable
                  onPress={() => void disableHfTokenAndRetry()}
                  className="min-h-12 flex-row items-center gap-2 mt-2 self-start rounded-lg border border-border px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel="Disable token and retry"
                >
                  <SlidersHorizontal size={14} color={colors.primary} />
                  <Text className="font-sans text-body-sm text-primary">
                    Disable Token &amp; Retry
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {searchLoading && searchResults.length === 0 ? (
            <View className="flex-row items-center justify-center py-4">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text className="ml-2 font-sans text-body-md text-secondary-text">
                Searching...
              </Text>
            </View>
          ) : (
            <FlatList
              className="grow"
              data={searchResults}
              keyExtractor={(r) => r.modelId}
              renderItem={renderResult}
              onEndReachedThreshold={0.3}
              onEndReached={() => void loadMoreModels()}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                searchLoadingMore ? (
                  <View className="flex-row items-center justify-center py-4">
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}
        </View>
        <SortSheet
          visible={sortOpen}
          active={searchFilters.sortBy}
          onClose={() => setSortOpen(false)}
          onPick={(sortBy) => applyFilters({ sortBy })}
        />
        <AuthorSheet
          visible={authorOpen}
          author={searchFilters.author}
          onClose={() => setAuthorOpen(false)}
          onApply={(author) => applyFilters({ author })}
        />
      </Sheet>
      <Sheet
        visible={visible && selected !== null}
        onClose={closeDetails}
        title={selected ? extractHFModelTitle(selected.modelId) : ""}
        titleEllipsize
        scrollable={false}
        testID="hf-details-sheet"
      >
        {selected ? (
          <View className="grow">
            {/* Fixed header above the list, PocketPal's DetailsView. */}
            <View className="pb-2">
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={closeDetails}
                  className="h-12 w-12 items-center justify-center -ml-3"
                  accessibilityRole="button"
                  accessibilityLabel="Back to search results"
                >
                  <ArrowLeft size={20} color={colors.secondaryText} />
                </Pressable>
                <Text className="flex-1 font-sans text-body-sm text-secondary-text/70">
                  {selected.author}
                </Text>
                {isVision ? <Chip label="Vision" /> : null}
              </View>
              <View className="flex-row flex-wrap items-center gap-2 mt-2">
                {selected.lastModified ? (
                  <StatChip label={timeAgo(selected.lastModified, Date.now(), true)} />
                ) : null}
                <StatChip label={`${formatNumber(selected.downloads)} downloads`} />
                <StatChip label={`${formatNumber(selected.likes)} likes`} />
                {selected.trendingScore && selected.trendingScore > 20 ? (
                  <StatChip label="Trending" trending />
                ) : null}
              </View>
              <Text className="font-sans-semibold text-body-md text-primary-text mt-3 mb-1">
                Files
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
                renderItem={renderFile}
                keyboardShouldPersistTaps="handled"
              />
            )}
          </View>
        ) : null}
        {snackWarnings ? (
          <WarningSnackbar warnings={snackWarnings} onDone={() => setSnackWarnings(null)} />
        ) : null}
        <SearchErrorSnackbar
          error={searchError}
          onRetry={() => void searchModels(searchQuery)}
        />
        {selected && visionSheetFile !== null ? (
          <VisionDownloadSheet
            visible={visionSheetFile !== null}
            file={visionSheetFile}
            siblings={files}
            onClose={() => setVisionSheetFile(null)}
            onConfirm={(file, opts) => onDownload(selected, file, opts)}
          />
        ) : null}
      </Sheet>
    </>
  );
}
