/** Code block: language header + copy button over highlighted code. */

import { Pressable, Text, View } from "react-native";
import { Check, Copy } from "lucide-react-native";
import CodeHighlighter from "react-native-code-highlighter";
import github from "react-syntax-highlighter/dist/esm/styles/hljs/github";

import { colors, font } from "../../themes/tokens.ts";
import { useCopy } from "../../hooks/useCopy.ts";

/** github's own white code background cleared so the Mist card shows through. */
const CODE_STYLE = {
  ...github,
  hljs: { ...github.hljs, background: "transparent" },
} as typeof github;

export function CodeBlock({
  language,
  text,
}: {
  language: string;
  text: string;
}) {
  const { copied, copy } = useCopy();

  return (
    <View className="mt-2 overflow-hidden rounded-card border border-border bg-surface-2">
      <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
        <Text className="font-sans text-caption text-secondary-text">{language}</Text>
        <Pressable
          onPress={() => copy(text)}
          className="h-12 w-12 items-center justify-center"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check size={16} color={colors.success} />
          ) : (
            <Copy size={16} color={colors.secondaryText} />
          )}
        </Pressable>
      </View>
      <CodeHighlighter
        // Light plan, not atomOneDark: the near-black code plane is the
        // retired world. The card supplies the Mist ground, so the style's
        // own white background is cleared. Inter carries the code
        // (Single Family Rule — no monospace exception).
        hljsStyle={CODE_STYLE}
        language={language}
        textStyle={{ fontSize: 14, fontFamily: font.sans, lineHeight: 20 }}
      >
        {text}
      </CodeHighlighter>
    </View>
  );
}
