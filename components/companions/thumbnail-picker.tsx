/** Thumbnail picker for the companion editor. */

import { useState } from "react";
import { Pressable, View, Image, Text, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { useColors } from "@/themes/tokens.ts";
import { RowLabel } from "@/components/settings-rows.tsx";

interface ThumbnailPickerProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function ThumbnailPicker({ value, onChange, onClear }: ThumbnailPickerProps) {
  const colors = useColors();
  const [preview, setPreview] = useState<string | undefined>(value);

  async function pickImage(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const uri = asset.base64 ? `data:${asset.mimeType};base64,${asset.base64}` : asset.uri;
      setPreview(uri);
      onChange(uri);
    }
  }

  async function clear(): Promise<void> {
    setPreview(undefined);
    onClear();
  }

  return (
    <View className="mb-5">
      <RowLabel label="Thumbnail" description="Tap to pick an image. Long-press to clear." />
      <Pressable
        onPress={pickImage}
        onLongPress={clear}
        className="relative h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-1 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="Change thumbnail"
        accessibilityHint="Double tap to pick an image. Long press to remove."
      >
        {preview ? (
          <>
            <Image source={{ uri: preview }} className="h-full w-full rounded-xl" resizeMode="cover" />
            <View className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center">
              <Text className="text-body-sm text-on-primary">Change</Text>
            </View>
          </>
        ) : (
          <View className="flex items-center justify-center gap-2">
            <Text className="text-body-sm text-secondary-text">Add thumbnail</Text>
          </View>
        )}
      </Pressable>
      {preview ? (
        <Pressable onPress={clear} className="mt-2 text-center" accessibilityRole="button" accessibilityLabel="Remove thumbnail">
          <Text className="text-body-sm text-error">Remove thumbnail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}