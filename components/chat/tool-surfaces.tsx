/** Tool-result surfaces, resolved by tool name (audit G5, ticket 02).
 *
 * A renderer REGISTRY rather than a switch in the chat screen: pocketpal
 * dispatches through one too, and that is what makes a fifth tool a
 * registration instead of an edit to the bubble.
 *
 * SHAPE, taken from pocketpal's WebSearchResultBubble rather than invented:
 * a collapsed summary ROW that opens a BOTTOM SHEET. An earlier revision
 * expanded inline, which diverged -- pocketpal has no inline expanded
 * state at all, so there was never anything to tap outside of.
 *
 * Concretely, that shape means:
 *   - the row is the whole control; the content lives in the sheet, so a
 *     long result list does not stretch the bubble it belongs to
 *   - the query and the count are SEPARATE lines, so a long query
 *     truncates but the count never does (pocketpal splits them for
 *     exactly this reason)
 *   - zero results is a STATIC row, not an expandable empty list
 *   - a tool with nothing to expand renders a static row with no control
 *
 * Dispatch order -- error first, then a registered renderer, then the
 * "used X" chip. An error must never fall through to the chip: that is
 * how a failed tool came to look like a successful one.
 */

import { useState, type ReactNode } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronRight, ExternalLink, Search, Wrench } from "lucide-react-native";

import type { AgentStep } from "@/types/chat.ts";
import { formatToolMetrics } from "@/utils/format.ts";
import { useColors } from "@/themes/tokens.ts";
import { HtmlPreviewBubble } from "./html-preview-bubble.tsx";

export interface ToolSurfaceProps {
  step: AgentStep;
}

export type ToolSurfaceRenderer = (props: ToolSurfaceProps) => ReactNode;

const renderers = new Map<string, ToolSurfaceRenderer>();

export function registerToolSurface(name: string, render: ToolSurfaceRenderer): void {
  renderers.set(name, render);
}

/** Undefined for a tool with no registered surface: the caller shows the chip. */
export function toolSurfaceFor(name: string): ToolSurfaceRenderer | undefined {
  return renderers.get(name);
}

/** `1,500 tokens · 35s` beneath a tool result (C15). Renders NOTHING
 *  when there is nothing to report — an older persisted call, or a
 *  tokens-0 engine — because absence is itself the cue. Shared by the
 *  sheet surfaces, the error block, and (as a suffix) the chip. */
export function ToolMetricsLine({
  metrics,
}: {
  metrics?: AgentStep["metrics"];
}): ReactNode {
  const text = formatToolMetrics(metrics);
  if (text === null) return null;
  return (
    <Text className="pb-1 pl-7 text-quiet">
      {text}
    </Text>
  );
}

/** The collapsed row that opens a sheet. The whole row is the control, with
 *  hitSlop rather than padding -- pocketpal's shape. */
function TriggerRow({
  label,
  count,
  onPress,
  accessibilityLabel,
  metrics,
}: {
  label: string;
  /** Rendered as its own non-wrapping element so it survives a long label. */
  count?: string;
  onPress: () => void;
  accessibilityLabel: string;
  metrics?: AgentStep["metrics"];
}) {
  const colors = useColors();
  return (
    <View className="w-full">
      <Pressable
        onPress={onPress}
        className="min-h-12 w-full flex-row items-center gap-2 rounded-lg px-2 py-1"
        hitSlop={{ top: 12, bottom: 12 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens the full result"
      >
        <Search size={14} color={colors.secondaryText} />
        {/* Split so a long query truncates but the count never does. */}
        <Text numberOfLines={1} className="flex-1 text-quiet">
          {label}
        </Text>
        {count !== undefined && (
          <Text numberOfLines={1} className="text-quiet">
            {count}
          </Text>
        )}
        <ChevronRight size={14} color={colors.secondaryText} />
      </Pressable>
      <ToolMetricsLine metrics={metrics} />
    </View>
  );
}

/** A static row: no control, because there is nothing to expand. Pocketpal's
 *  ToolUsedChip is the same shape -- a plain View with a glyph and a label. */
function StaticRow({
  label,
  metrics,
}: {
  label: string;
  metrics?: AgentStep["metrics"];
}) {
  const colors = useColors();
  return (
    <View className="w-full">
      <View className="min-h-12 w-full flex-row items-center gap-2 rounded-lg px-2 py-1">
        <Wrench size={14} color={colors.secondaryText} />
        <Text numberOfLines={1} className="flex-1 text-quiet">
          {label}
        </Text>
      </View>
      <ToolMetricsLine metrics={metrics} />
    </View>
  );
}

function Sheet({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  // Mounted always, never early-returned: an unmounted Modal cannot play its
  // dismissal, so the close was a hard cut while the open slid up (D4-3).
  return (
    // `Modal` takes no className -- on the AGENTS.md exception list. Its
    // children are ordinary components and do.
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable
        className="flex-1 justify-end bg-scrim"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close results"
      >
        {/* The panel swallows taps so only the scrim dismisses. */}
        <Pressable
          className="max-h-[70%] rounded-t-2xl bg-surface-1 px-4 pb-6 pt-3"
          onPress={() => {}}
          accessibilityLabel="Results"
          accessibilityRole="button"
        >
          <ScrollView>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface Hit {
  title: string;
  url: string;
  snippet: string;
}

/** Reads the structured hits the seam carries. A malformed or absent shape
 *  yields an empty list rather than a crash -- the data came from disk. */
function hitsOf(step: AgentStep): Hit[] {
  const raw: unknown = step.data?.hits;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is Hit =>
      typeof h === "object" && h !== null && typeof (h as Hit).url === "string",
  );
}

function HitRow({ hit }: { hit: Hit }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(hit.url).catch(() => {
          /* a dead link must not crash the bubble */
        });
      }}
      className="min-h-12 justify-center rounded-lg px-1 py-2"
      accessibilityRole="link"
      accessibilityLabel={hit.title === "" ? hit.url : hit.title}
      accessibilityHint={hit.snippet === "" ? undefined : hit.snippet}
    >
      <View className="flex-row items-center gap-1">
        <Text numberOfLines={2} className="flex-1 font-sans text-caption text-primary-text">
          {hit.title === "" ? hit.url : hit.title}
        </Text>
        <ExternalLink size={12} color={colors.secondaryText} />
      </View>
      {hit.snippet !== "" && (
        <Text numberOfLines={2} className="mt-0.5 font-sans text-micro text-secondary-text">
          {hit.snippet}
        </Text>
      )}
    </Pressable>
  );
}

function WebSearchSurface({ step }: ToolSurfaceProps) {
  const [open, setOpen] = useState(false);
  const hits = hitsOf(step);
  const query = typeof step.input?.query === "string" ? step.input.query : "";

  // Zero results is a STATIC row: there is nothing to open, and an
  // expandable empty list is worse than saying so.
  if (hits.length === 0) {
    return <StaticRow label={`No results for ${query}`.trim()} metrics={step.metrics} />;
  }
  return (
    <>
      <TriggerRow
        label={query === "" ? "Searched the web" : `Searched for ${query}`}
        count={hits.length === 1 ? "· 1 result" : `·  ${hits.length} results`}
        onPress={() => setOpen(true)}
        accessibilityLabel={query === "" ? "Show results" : `Show results for ${query}`}
        metrics={step.metrics}
      />
      <Sheet visible={open} onDismiss={() => setOpen(false)}>
        <Text className="mb-2 font-sans-semibold text-body-md text-primary-text">
          {query === "" ? "Search results" : `Results for “${query}”`}
        </Text>
        {hits.map((hit) => (
          <HitRow key={hit.url} hit={hit} />
        ))}
      </Sheet>
    </>
  );
}

/** A fetched page. Long by nature, so it lives in a sheet rather than
 *  stretching the bubble the answer sits in. */
function ReadUrlSurface({ step }: ToolSurfaceProps) {
  const [open, setOpen] = useState(false);
  // The ARTICLE, not the model's fenced copy. `step.result` is what the
  // MODEL reads, so it carries an "untrusted content" banner; rendering
  // that to a user means showing them prompt-injection instructions they
  // never asked for. Falls back to `result` for a row predating the split.
  const text =
    typeof step.data?.text === "string" ? step.data.text : (step.result ?? "");
  // Reported by the seam, never inferred here.
  const truncated = step.data?.truncated === true;
  if (text === "") return <StaticRow label="No page text" />;
  return (
    <>
      <TriggerRow
        label="Read a page"
        count={truncated ? "·  cut off" : undefined}
        onPress={() => setOpen(true)}
        accessibilityLabel="Show the page text"
        metrics={step.metrics}
      />
      <Sheet visible={open} onDismiss={() => setOpen(false)}>
        {truncated && (
          <Text className="mb-2 font-sans text-micro text-secondary-text">
            Truncated — this is only the start of the page.
          </Text>
        )}
        <Text className="text-quiet">{text}</Text>
      </Sheet>
    </>
  );
}

/** A short plain result: nothing to expand, so a static row. */
function PlainSurface({ step }: ToolSurfaceProps) {
  const text = step.result ?? "";
  return (
    <StaticRow
      label={text === "" ? step.tool : `${step.tool} — ${text}`}
      metrics={step.metrics}
    />
  );
}

/** Model-authored HTML (PocketParity: RenderHtmlTalentUI). The html
 *  arrives on `data` — the model was shown only the fixed success summary,
 *  never its own markup echoed back. */
function RenderHtmlSurface({ step }: ToolSurfaceProps) {
  const html = typeof step.data?.html === "string" ? step.data.html : "";
  const title = typeof step.data?.title === "string" ? step.data.title : undefined;
  // A registered surface renders unconditionally here (this registry has no
  // `node != null` fall-through, because calling a surface as a function to
  // get one would break the useState surfaces' hooks). So an empty result
  // states itself rather than rendering nothing — same rule as ReadUrl.
  if (html === "") return <StaticRow label="No preview" metrics={step.metrics} />;
  return <HtmlPreviewBubble html={html} title={title} />;
}

// Module load, not first render: the chat screen must never be the thing
// that decides a renderer exists.
registerToolSurface("web_search", WebSearchSurface);
registerToolSurface("read_url", ReadUrlSurface);
registerToolSurface("calculate", PlainSurface);
registerToolSurface("datetime", PlainSurface);
registerToolSurface("render_html", RenderHtmlSurface);