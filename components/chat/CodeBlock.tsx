/** Code block: language header + copy button over highlighted code. */

import { Pressable, Text, View } from "react-native";
import { Check, Copy } from "lucide-react-native";
import CodeHighlighter from "react-native-code-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

import { colors } from "../../themes/tokens.ts";
import { useCopy } from "../../hooks/useCopy.ts";

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
            <Check size={14} color={colors.success} />
          ) : (
            <Copy size={14} color={colors.secondaryText} />
          )}
        </Pressable>
      </View>
      <CodeHighlighter
        hljsStyle={atomOneDark}
        language={language}
        textStyle={{ fontSize: 13 }}
      >
        {text}
      </CodeHighlighter>
    </View>
  );
}
