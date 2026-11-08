/** One labelled text input in a companion sheet.
 *
 *  The editor's identity fields and the dynamic parameter fields share this
 *  shape: a row label + description above an input that matches the settings
 *  card's chrome. PocketPal's FormField/TextInput pair.
 */

import { TextInput, View } from "react-native";

import { RowLabel } from "@/components/settings-rows.tsx";

export function CompanionTextRow({
  label,
  description,
  value,
  placeholder,
  multiline,
  onChangeText,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onChangeText: (text: string) => void;
}) {
  return (
    <View className="mb-5">
      <RowLabel label={label} description={description} />
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor="var(--color-secondary-text-muted)"
        multiline={multiline}
        onChangeText={onChangeText}
        className={`min-h-10 rounded-lg border border-border bg-surface-1 px-3 py-2 text-body${
          multiline ? " min-h-28" : ""
        }`}
        accessibilityLabel={label}
      />
    </View>
  );
}
