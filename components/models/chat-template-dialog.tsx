/** "Edit Chat Template" dialog — the nested sheet inside Model Settings
 * (PocketPal parity: ModelSettings.tsx:273-295).
 *
 * The whole config lives in the PARENT's temp state and this dialog edits
 * it there; nothing persists until the outer sheet's "Save Changes". That
 * is PocketPal's model exactly (its dialog "Close" commits to temp state,
 * and the pinned action bar does the writing).
 *
 * Picking a base template REPLACES the whole config — tokens, template,
 * system prompt, add-generation-prompt — because a preset is a bundle, not
 * a template string (PocketPal ModelSettingsSheet.tsx:96-101). The strings
 * themselves come from utils/chat-templates.ts, generated verbatim from the
 * chat-formatter package PocketPal itself depends on.
 */

import { Pressable, Text, TextInput, View } from "react-native";

import { Sheet } from "../sheet.tsx";
import { PickerMenu } from "../picker-menu.tsx";
import {
  CHAT_TEMPLATE_NAMES,
  getChatTemplate,
  type ChatTemplatePreset,
} from "../../utils/chat-templates.ts";
import { colors } from "../../themes/tokens.ts";

export function ChatTemplateDialog({
  visible,
  onClose,
  config,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  /** The temp config as the parent holds it right now. */
  config: ChatTemplatePreset;
  /** Write the edited config back into the parent's temp state. */
  onChange: (next: ChatTemplatePreset) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit Chat Template"
      testID="chat-template-dialog"
      actions={
        <Pressable
          onPress={onClose}
          className="btn btn--primary min-h-12 self-end"
          accessibilityRole="button"
          accessibilityLabel="Close chat template editor"
        >
          <Text className="font-sans-semibold text-body-md text-on-primary">
            Close
          </Text>
        </Pressable>
      }
    >
      <View className="gap-4">
        <PickerMenu
          label="Base Chat Template:"
          options={CHAT_TEMPLATE_NAMES}
          value={config.name}
          onChange={(name) => {
            // The preset replaces the WHOLE config, except a template the
            // user hand-wrote after picking it: a fresh pick is the user
            // asking for the bundle, so their edits to the old one go.
            onChange(getChatTemplate(name));
          }}
          show={(name) => name}
        />
        {/* The two notes PocketPal shows under the picker (en.json:440-441).
            Jinja, not Nunjucks: llama.rn applies jinja templates, and
            claiming otherwise would send people hunting for the wrong
            syntax. */}
        <Text className="font-sans text-caption text-secondary-text">
          Note: Changing the template may alter BOS, EOS, and system prompt.
        </Text>
        <Text className="font-sans text-caption text-secondary-text">
          Uses Jinja. Leave empty to use the model's template.
        </Text>
        <TextInput
          value={config.chatTemplate}
          onChangeText={(text) => onChange({ ...config, chatTemplate: text })}
          placeholder="Enter your chat template here..."
          placeholderTextColor={colors.secondaryText}
          multiline
          numberOfLines={10}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-lg border border-border bg-surface-2 px-4 py-3 font-mono text-body-sm text-primary-text"
        />
      </View>
    </Sheet>
  );
}