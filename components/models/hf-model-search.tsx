/** Add a model from Hugging Face.
 *
 * PocketParity with PocketPal's HFModelSearch: two stacked sheets — search
 * underneath, file detail on top — a search bar carrying its own sort and
 * author filter sheets, paging from the Hub's Link header, per-file
 * bookmarks, storage-gated downloads and the four warning chips.
 *
 * This file is the flow and nothing else: it owns the query, the selected
 * repo, and the two sheets. The surfaces are split to mirror the
 * reference's four files — `HFSearchView` (its SearchView), `HFDetailsView`
 * (its DetailsView) and `HFFileRow` (its ModelFileCard). See
 * docs/research/2026-10-12-pocketpal-hf-model-card-parity.md.
 *
 * The sheet is components/Sheet.tsx, not @expo/ui's native sheet: that
 * one is already rejected in Sheet.tsx's header (no window insets, an
 * Android snap that collapses to half/full, and a pan gesture that eats
 * the list's scroll).
 */

import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CheckCircle2 } from "lucide-react-native";

import { Sheet } from "../sheet.tsx";
import { useSnackbar } from "../snackbar.tsx";
import { useColors } from "@/themes/tokens.ts";
import { useModelStore } from "@/store/model-store";
import { extractHFModelTitle } from "@/services/models/hf-format.ts";
import { HFDetailsView } from "./hf-details-view.tsx";
import { HFSearchView, SORT_OPTIONS } from "./hf-search-view.tsx";
import type { VisionDownloadChoice } from "./vision-download-sheet.tsx";
import type { HFModelFile, HFModelSearchResult } from "@/types/models";

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
  const colors = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title="Sort by" testID="hf-sort-sheet">
      {SORT_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => {
            void Haptics.selectionAsync();
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
  const colors = useColors();
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
        className="surface bg-surface-1 font-sans text-body-lg text-primary-text px-5 py-3"
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
          <Text className="text-body">Clear</Text>
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
          <Text className="text-action">Apply</Text>
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
  // Plugged into the details sheet's TrueSheet so the file list scrolls in
  // place and only the grabber moves the sheet.
  const detailsListRef = useRef<FlatList<HFModelFile> | null>(null);
  // Stable selectors: actions are referentially stable, but useShallow
  // keeps the re-rendering subscriptions isolated - a bookmark toggle must
  // not rebuild the search list.
  const searchModels = useModelStore((s) => s.searchModels);
  const setSearchFilters = useModelStore((s) => s.setSearchFilters);
  const getModelFiles = useModelStore((s) => s.getModelFiles);
  const searchQuery = useModelStore((s) => s.searchQuery);
  const searchFilters = useModelStore((s) => s.searchFilters);
  const searchError = useModelStore((s) => s.searchError);
  const startDownload = useModelStore((s) => s.startDownload);
  const activeHfToken = useModelStore((s) => s.activeHfToken);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HFModelSearchResult | null>(null);
  const [files, setFiles] = useState<HFModelFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  // Bumped by the filter sheets so the debounce effect re-runs: the store
  // holds the filters, and its identity never changes.
  const [filtersVersion, setFiltersVersion] = useState(0);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      return;
    }
    // ponytail: debounce, PocketParity's 500ms.
    const t = setTimeout(() => {
      void searchModels(query);
    }, 500);
    return () => clearTimeout(t);
  }, [query, visible, filtersVersion, searchModels]);

  const applyFilters = (patch: Parameters<typeof setSearchFilters>[0]) => {
    setSearchFilters(patch);
    setFiltersVersion((v) => v + 1);
  };

  const openDetails = async (result: HFModelSearchResult) => {
    setSelected(result);
    setFiles([]);
    setFilesLoading(true);
    try {
      const loaded = await getModelFiles(result.modelId);
      setFiles(loaded);
    } catch (error) {
      console.error("Failed to load model files:", error);
    } finally {
      setFilesLoading(false);
    }
  };

  const closeDetails = () => {
    setSelected(null);
    setFiles([]);
  };

  // The token rides along or a gated repo 401s halfway through.
  const onStartDownload = (
    file: HFModelFile,
    opts?: VisionDownloadChoice,
  ) => {
    if (!selected) return;
    void startDownload(
      selected.modelId,
      file,
      activeHfToken() ?? undefined,
      // The repo listing came from openDetails' getModelFiles call: hand it
      // to the pairing (search results carry no files to fall back on).
      { ...opts, files },
    );
  };

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
        <HFSearchView
          query={query}
          onQueryChange={setQuery}
          onSelect={(result) => void openDetails(result)}
          onOpenAuthor={() => setAuthorOpen(true)}
          onOpenSort={() => setSortOpen(true)}
        />
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
        scrollableRef={detailsListRef}
        /* PocketParity (HFModelSearch.tsx:91-100 enableContentPanningGesture:
            false): the file list scrolls IN PLACE; a scroll gesture never
            drives the sheet detents - only the grabber moves the sheet. */
        testID="hf-details-sheet"
      >
        {selected ? (
          <HFDetailsView
            result={selected}
            files={files}
            filesLoading={filesLoading}
            onBack={closeDetails}
            onStartDownload={onStartDownload}
            listRef={detailsListRef}
          />
        ) : null}
        <SearchErrorSnackbar
          error={searchError}
          onRetry={() => void searchModels(searchQuery)}
        />
      </Sheet>
    </>
  );
}
