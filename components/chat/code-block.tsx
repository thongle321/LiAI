/** Code block: language header + copy button over highlighted code. */

import { Pressable, Text, View } from "react-native";
import { Check, Copy } from "lucide-react-native";
import CodeHighlighter from "react-native-code-highlighter";
import github from "react-syntax-highlighter/dist/esm/styles/hljs/github";
import githubDark from "react-syntax-highlighter/dist/esm/styles/hljs/github-gist";

import { font, typeScale, useColors, useColorScheme } from "@/themes/tokens.ts";
import { useCopy } from "@/hooks/useCopy.ts";

/** github's own white code background cleared so the card ground shows
 *  through. The dark variant is github-gist (near-black, same family),
 *  cleared the same way — so code follows the app theme with one prop. */
function codeStyle(dark: boolean): typeof github {
  const base = dark ? githubDark : github;
  return {
    ...base,
    hljs: { ...base.hljs, background: "transparent" },
  };
}

export function CodeBlock({
  language,
  text,
}: {
  language: string;
  text: string;
}) {
  const colors = useColors();
  const dark = useColorScheme() === "dark";
  const { copied, copy } = useCopy();

  return (
    <View className="surface mt-2 overflow-hidden bg-surface-2">
      <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
        <Text className="text-quiet">{language}</Text>
        <Pressable
          onPress={() => copy(text)}
          className="icon-btn"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check size={16} color={colors.successMark} />
          ) : (
            <Copy size={16} color={colors.secondaryText} />
          )}
        </Pressable>
      </View>
      <CodeHighlighter
        // github (light) / github-gist (dark), same family, both with the
        // style's own background cleared so the card's Mist/Surface-2 ground
        // shows through. Inter carries the code (Single Family Rule — no
        // monospace exception).
        hljsStyle={codeStyle(dark)}
        language={language}
        textStyle={{
          fontSize: typeScale.bodyMd.size,
          fontFamily: font.sans,
          lineHeight: typeScale.bodyMd.lineHeight,
        }}
      >
        {text}
      </CodeHighlighter>
    </View>
  );
}
