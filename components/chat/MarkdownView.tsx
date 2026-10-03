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
  // Pocketpal's bubble body (MarkdownView/styles.ts:15).
  fontSize: 16,
  color: colors.primaryText,
};

// The reasoning block's own rung: their ReasoningBlock pins body 14/20.
const denseText = { ...baseText, fontSize: 14, lineHeight: 20 };

// Every text-bearing key gets the family: the library's internals set
// sizes and weights but no fontFamily, so any key missed here falls
// back to Roboto and sits visibly off-baseline next to Inter body.
const headingText = {
  fontFamily: font.sansSemiBold,
  color: colors.primaryText,
};

export function MarkdownView({
  text,
  dense = false,
}: {
  text: string;
  /** Reasoning block: renders at pocketpal's 14/20 thinking rung. */
  dense?: boolean;
}) {
  const body = dense ? denseText : baseText;
  const elements = useMarkdown(text === "" ? " " : text, {
    // The app is light-locked; leaving this on "dark" made the library
    // inject its dark-scheme defaults into a light conversation.
    colorScheme: "light",
    renderer,
    styles: {
      text: body,
      paragraph: { marginBottom: 8 },
      strong: { ...body, fontFamily: font.sansSemiBold },
      em: { ...body, fontStyle: "italic" },
      strikethrough: { ...body },
      link: { ...body, color: colors.primary },
      // Marked's defaults (32/28/24/22) are the biggest type in a chat
      // bubble; pinned to the bubble scale (grilling Q4).
      h1: { ...headingText, fontSize: 24 },
      h2: { ...headingText, fontSize: 20 },
      h3: { ...headingText, fontSize: 18 },
      h4: { ...headingText, fontSize: 16 },
      h5: { ...headingText, fontSize: 16 },
      h6: { ...headingText, fontSize: 16 },
      li: { ...body },
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
