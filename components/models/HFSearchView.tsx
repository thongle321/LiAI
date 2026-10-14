/** The search half of the Hugging Face sheet: the query, its filters, and
 * the result rows.
 *
 * PocketParity: pocketpal-ai/src/screens/ModelsScreen/HFModelSearch/
 * SearchView/SearchView.tsx. Split out of the former single-file
 * HFModelSearch.tsx to mirror the reference's shape; the row anatomy,
 * filter chips and empty/error handling are unchanged by the move.
 *
 * Reads the store for its own data, as the reference's SearchView reads
 * hfStore: the parent owns only the query text (it has to seed it) and the
 * two decisions that navigate.
 */

import { useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useModelStore } from "../../store/modelStore";
import {
  extractHFModelTitle,
  formatNumber,
  isVisionModel,
  timeAgo,
} from "../../lib/models/hf-format.ts";
import { ModelTypeIcon } from "./ModelBits.tsx";
import type { HFModelSearchResult } from "../../types/models";

export const SORT_OPTIONS: {
  value: "relevance" | "downloads" | "lastModified" | "likes";
  label: string;
}[] = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "lastModified", label: "Last modified" },
  { value: "likes", label: "Likes" },
];

/** The reference drops any page request landing inside 1000ms of the last
 *  one (SearchView.tsx:41-51). A fast fling emits several onEndReached
 *  events; ours had no guard, so each one fetched a page. */
const PAGE_GUARD_MS = 1000;

export function HFSearchView({
  query,
  onQueryChange,
  onSelect,
  onOpenAuthor,
  onOpenSort,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (result: HFModelSearchResult) => void;
  onOpenAuthor: () => void;
  onOpenSort: () => void;
}) {
  const searchResults = useModelStore((s) => s.searchResults);
  const searchLoading = useModelStore((s) => s.searchLoading);
  const searchLoadingMore = useModelStore((s) => s.searchLoadingMore);
  const searchError = useModelStore((s) => s.searchError);
  const searchFilters = useModelStore((s) => s.searchFilters);
  const loadMoreModels = useModelStore((s) => s.loadMoreModels);
  const disableHfTokenAndRetry = useModelStore((s) => s.disableHfTokenAndRetry);
  // A ref, not state: this runs on scroll and must not re-render the list.
  const lastPageCall = useRef(0);

  const onEndReached = () => {
    const now = Date.now();
    if (searchLoadingMore || now - lastPageCall.current < PAGE_GUARD_MS) {
      return;
    }
    lastPageCall.current = now;
    void loadMoreModels();
  };

  return (
    <View className="grow">
      {/* PocketPal EnhancedSearchBar layout: search pill on top, filter
          chips (author + sort) in a horizontal scroll below. */}
      <View className="pb-3">
        <View className="flex-row items-center gap-2 bg-surface-1 border border-border rounded-full px-4">
          <Search size={16} color={colors.secondaryText} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search models (e.g., llama, qwen, gemma)"
            placeholderTextColor={colors.secondaryText}
            accessibilityLabel="Search Hugging Face models"
            className="flex-1 font-sans text-body-lg text-primary-text py-3"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => onQueryChange("")}
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
            onPress={onOpenAuthor}
            className={`min-h-12 flex-row items-center gap-1 rounded-full px-3 ${
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
            onPress={onOpenSort}
            className="ml-2 min-h-12 flex-row items-center gap-1 rounded-full px-3 border border-border"
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
          renderItem={({ item: result }) => (
            /* Row anatomy is ours, deliberately. The reference stacks the
               author ABOVE the title (SearchView.tsx:99-107) and adds no
               trailing affordance; we lead with the model, put
               `by {author}` under it, and mark the row as navigable.
               2026-10-12 parity record, divergence 1. */
            <Pressable
              onPress={() => onSelect(result)}
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
                  <Text className="font-sans text-body-sm text-secondary-text-muted mt-1">
                    {`by ${result.author}`}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </View>
              <View className="flex-row flex-wrap items-center gap-2 mt-2">
                <Text className="font-sans text-body-sm text-secondary-text-muted">
                  {result.lastModified ? timeAgo(result.lastModified, Date.now(), false) : ""}
                </Text>
                <Text className="font-sans text-body-sm text-secondary-text-muted">
                  {`${formatNumber(result.downloads)} downloads`}
                </Text>
                <Text className="font-sans text-body-sm text-secondary-text-muted">
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
          )}
          onEndReachedThreshold={0.3}
          onEndReached={onEndReached}
          keyboardShouldPersistTaps="handled"
          /* The reference separates three empty states; we implement two. A
             search that found nothing used to leave a blank panel under a
             populated search bar, which reads as a hung request.
             PocketParity: SearchView.tsx:118-124. */
          ListEmptyComponent={
            query.length > 0 && !searchLoading ? (
              <Text className="py-6 text-center font-sans text-body-md text-secondary-text">
                No models found for “{query}”
              </Text>
            ) : null
          }
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
  );
}
