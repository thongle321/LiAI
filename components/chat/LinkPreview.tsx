/** Inline link preview under a bubble (ADR-004 narrow exception).
 *
 * First http(s) URL in the message only; uncredentialed public fetch via
 * `link-preview-js/mobile`. Loading and failure render nothing — the
 * bubble is complete without its preview. Callers skip streaming
 * messages so a half-typed URL never triggers a garbage fetch.
 */

import { useEffect, useState } from "react";
import { Image as RNImage, Pressable, Text, View } from "react-native";
import { openURL } from "expo-linking";

import { colors } from "../../themes/tokens.ts";
import { fetchPreview, firstUrl, type LinkPreview } from "../../lib/chat/link-preview.ts";

export function LinkPreviewCard({ text }: { text: string }) {
  const url = firstUrl(text);
  const [preview, setPreview] = useState<LinkPreview | null>(null);

  useEffect(() => {
    if (url === null) return;
    let alive = true;
    void fetchPreview(url).then((row) => {
      if (alive) setPreview(row);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  if (url === null || preview === null) return null;
  const domain = (() => {
    try {
      return new URL(preview.url).hostname;
    } catch {
      return preview.url;
    }
  })();

  return (
    <Pressable
      onPress={() => void openURL(preview.url).catch(() => undefined)}
      className="mt-2 flex-row items-center gap-2 overflow-hidden rounded-card border border-border bg-surface-2 p-2"
    >
      {preview.image !== undefined && (
        <RNImage source={{ uri: preview.image }} className="h-12 w-12 rounded-lg" />
      )}
      <View className="flex-1">
        <Text
          numberOfLines={2}
          className="font-sans text-body-sm font-semibold text-primary-text"
        >
          {preview.title ?? preview.url}
        </Text>
        {preview.description !== undefined && (
          <Text numberOfLines={2} className="font-sans text-body-sm text-secondary-text">
            {preview.description}
          </Text>
        )}
        <Text className="font-sans text-caption" style={{ color: colors.primary }}>
          {domain}
        </Text>
      </View>
    </Pressable>
  );
}
