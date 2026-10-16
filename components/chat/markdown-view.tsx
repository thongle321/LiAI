/** Markdown renderer for assistant bubbles (Wave 1 chat).
 *
 * react-native-marked parses to native views directly (no HTML layer);
 * the code renderer override plugs syntax highlighting + copy in, and
 * the link overrides open http(s) only, loudly (C2).
 * The renderer instance is module-level: stable identity across the
 * token-by-token re-parses of a streaming reply.
 */

import { Fragment, type ReactNode } from "react";
import {
  Dimensions,
  Linking,
  ScrollView,
  Text,
  TouchableHighlight,
  View,
  type ImageStyle,
  type TextStyle,
} from "react-native";
import {
  Renderer,
  useMarkdown,
  type RendererInterface,
} from "react-native-marked";

import { isOpenableUrl } from "../../services/chat/links.ts";
import { useChatStore } from "../../store/chat";
import { colors, embeddedText, font, typeScale } from "../../themes/tokens.ts";
import { CodeBlock } from "./code-block.tsx";

/** One guarded open shared by both link overrides: Linking, then the
 *  chat's inline notice on failure. The base renderer swallows failures
 *  into console.warn — silence to the user (C2). Never throws. */
function openLink(href: string): void {
  void Linking.openURL(href).catch(() => {
    useChatStore.getState().setChatWarning({
      message: "Couldn't open that link.",
      severity: "warning",
      recoverable: false,
    });
  });
}

/** Fixed shared column width — the library's own layout math
 *  (react-native-marked utils/table.ts getTableWidthArr): ~43% of the
 *  window per column. One width for every row keeps the vertical grid
 *  lines aligned (content-sizing each row let them drift and the grid
 *  read broken), and a multi-column table overflows into the horizontal
 *  ScrollView instead of wrapping cells into narrow unreadable columns.
 *  Measured once at module load, as the base renderer measures once per
 *  instance; Dimensions is the sanctioned inline-style exception. */
const COLUMN_WIDTH = Math.floor(Dimensions.get("window").width * (1.3 / 3));

/** One cell: the shared column width plus its two grid borders. Header
 *  and body cells are identical — their rows differ by fill. */
function TableCell({ children }: { children: ReactNode }) {
  return (
    <View
      className="border-b border-r border-border px-2 py-1.5"
      style={{ width: COLUMN_WIDTH }}
    >
      {children}
    </View>
  );
}

/** One GFM table (C13): header fill so the first row is distinguishable,
 *  a 1px cell grid, and a horizontal ScrollView so wide tables scroll
 *  instead of clipping — cells size to content, so narrow tables stay
 *  put. Cell borders draw right+bottom and each row draws its left, so
 *  every grid edge is exactly one line (a full container border would
 *  double them). Plain Views on purpose: the library's MDTable leans on
 *  react-native-reanimated-table, which is its dependency, not ours. */
function MarkdownTable({
  header,
  rows,
}: {
  header: ReactNode[][];
  rows: ReactNode[][][];
}) {
  return (
    <View className="mb-2">
      <ScrollView horizontal>
        <View>
          <View className="flex-row border-l border-t border-border bg-surface-2">
            {header.map((cells, i) => (
              <TableCell key={`h-${i}`}>{cells}</TableCell>
            ))}
          </View>
          {rows.map((row, i) => (
            <View key={`r-${i}`} className="flex-row border-l border-border">
              {row.map((cell, j) => (
                <TableCell key={`c-${j}`}>{cell}</TableCell>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

class ChatRenderer extends Renderer implements RendererInterface {
  /** The base keeps `selectable` private; mirror the constructor option
   *  here so link text keeps long-press selection (C2). */
  private readonly selectableText: boolean;

  constructor(options?: { selectable?: boolean }) {
    super(options);
    this.selectableText = options?.selectable ?? true;
  }

  code(text: string, language?: string): ReactNode {
    return (
      <CodeBlock key={this.getKey()} language={language || "text"} text={text} />
    );
  }

  /** C2: only plain http(s) is pressable. A markdown body is untrusted,
   *  so `file:`/`javascript:`/bare schemes render as plain text — no
   *  link styling, no press, never an inert-looking link. */
  link(
    children: string | ReactNode[],
    href: string,
    styles?: TextStyle,
  ): ReactNode {
    if (!isOpenableUrl(href)) {
      return this.text(children);
    }
    return (
      <Text
        key={this.getKey()}
        selectable={this.selectableText}
        onPress={() => openLink(href)}
        accessibilityRole="link"
        accessibilityHint={href}
        style={styles}
      >
        {children}
      </Text>
    );
  }

  /** Linked images carry the same hazard as linked text — the base
   *  implementation presses any scheme — so they share the guard and the
   *  one open. An unopenable href drops the press, keeping the image. */
  linkImage(
    href: string,
    imageUrl: string,
    alt?: string,
    style?: ImageStyle,
    title?: string,
  ): ReactNode {
    const imageNode = this.image(imageUrl, alt, style, title);
    if (!isOpenableUrl(href)) {
      return imageNode;
    }
    return (
      <TouchableHighlight
        key={this.getKey()}
        accessibilityRole="link"
        accessibilityHint={href}
        onPress={() => openLink(href)}
      >
        {imageNode}
      </TouchableHighlight>
    );
  }

  /** C13: the base Renderer DOES expose a table hook (verified at the
   *  library's lib/types.ts:86) — so we override rather than reinvent.
   *  The override exists for styling: no second table path, and the one
   *  renderer serves both the body and the reasoning block (dense), so
   *  tables render in both by construction. The module-level renderer
   *  identity below keeps streaming re-parses from remounting them. */
  table(header: ReactNode[][], rows: ReactNode[][][]): ReactNode {
    return <MarkdownTable header={header} rows={rows} />;
  }
}

const renderer = new ChatRenderer({ selectable: true });

const baseText = {
  fontFamily: font.sans,
  // Pocketpal's bubble body (MarkdownView/styles.ts:15) — the bodyLg rung.
  fontSize: typeScale.bodyLg.size,
  color: colors.primaryText,
};

// The reasoning block's own rung: their ReasoningBlock pins body 14/20 —
// exactly the bodyMd rung, so it comes from the shared scale.
const denseText = {
  ...baseText,
  fontSize: typeScale.bodyMd.size,
  lineHeight: typeScale.bodyMd.lineHeight,
};

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
  maxWidth,
}: {
  text: string;
  /** Reasoning block: renders at pocketpal's 14/20 thinking rung. */
  dense?: boolean;
  /** Definite measure width for the parsed body.
   *
   *  The parsed elements used to be returned as a bare fragment, so
   *  nothing constrained them: a native <Text> reports its full unwrapped
   *  width as intrinsic, the row shrink-wrapped to that, and the list
   *  clipped the overflow instead of wrapping it. react-native-marked
   *  exposes no width option of its own — its README's hook example gets
   *  one from the surrounding <ScrollView> — so the caller owns this
   *  wrapper. See services/chat//message-width.ts. */
  maxWidth?: number;
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
      // bubble; pinned to the bubble scale (grilling Q4). Sizes come from
      // the shared type scale — h1 rides h2's 24 rung, h2 rides h3's 20,
      // h4-h6 sit at body size; markdownH3 (18) is the one bubble size
      // with no rung, so it lives in embeddedText.
      h1: { ...headingText, fontSize: typeScale.h2.size },
      h2: { ...headingText, fontSize: typeScale.h3.size },
      h3: { ...headingText, fontSize: embeddedText.markdownH3 },
      h4: { ...headingText, fontSize: typeScale.bodyLg.size },
      h5: { ...headingText, fontSize: typeScale.bodyLg.size },
      h6: { ...headingText, fontSize: typeScale.bodyLg.size },
      li: { ...body },
      codespan: {
        fontFamily: font.sans,
        fontSize: embeddedText.code,
        color: colors.primaryText,
        backgroundColor: colors.surface2,
      },
      codeText: {
        fontFamily: font.sans,
        fontSize: embeddedText.code,
        color: colors.primaryText,
      },
      list: { marginBottom: 8 },
    },
  });
  return (
    <View style={maxWidth === undefined ? undefined : { maxWidth }}>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </View>
  );
}
