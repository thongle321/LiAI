/** Markdown renderer for assistant bubbles (Wave 1 chat).
 *
 * react-native-marked parses to native views directly (no HTML layer);
 * the code renderer override plugs syntax highlighting + copy in.
 * The renderer instance is module-level: stable identity across the
 * token-by-token re-parses of a streaming reply.
 */

import { Fragment, type ReactNode } from "react";
import {
  Renderer,
  useMarkdown,
  type RendererInterface,
} from "react-native-marked";

import { colors, font } from "../../themes/tokens.ts";
import { CodeBlock } from "./CodeBlock.tsx";

class ChatRenderer extends Renderer implements RendererInterface {
  code(text: string, language?: string): ReactNode {
    return (
      <CodeBlock key={this.getKey()} language={language || "text"} text={text} />
    );
  }
}

const renderer = new ChatRenderer({ selectable: true });

const baseText = {
  fontFamily: font.sans,
  fontSize: 14,
  color: colors.primaryText,
};

// Every text-bearing key gets the family: the library's internals set
// sizes and weights but no fontFamily, so any key missed here falls
// back to Roboto and sits visibly off-baseline next to Raleway body.
const headingText = {
  fontFamily: font.sansSemiBold,
  color: colors.primaryText,
};

export function MarkdownView({ text }: { text: string }) {
  const elements = useMarkdown(text === "" ? " " : text, {
    colorScheme: "dark",
    renderer,
    styles: {
      text: baseText,
      paragraph: { marginBottom: 8 },
      strong: { ...baseText, fontFamily: font.sansSemiBold },
      em: { ...baseText, fontStyle: "italic" },
      strikethrough: { ...baseText },
      link: { ...baseText, color: colors.primary },
      h1: { ...headingText },
      h2: { ...headingText },
      h3: { ...headingText },
      h4: { ...headingText },
      h5: { ...headingText },
      h6: { ...headingText },
      li: { ...baseText },
      codespan: {
        fontFamily: font.sans,
        fontSize: 13,
        color: colors.primaryText,
        backgroundColor: colors.surface2,
      },
      codeText: {
        fontFamily: font.sans,
        fontSize: 13,
        color: colors.primaryText,
      },
      list: { marginBottom: 8 },
    },
  });
  return (
    <>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </>
  );
}
