/** Tool-result surfaces, resolved by tool name (audit G5, ticket 02).
 *
 * A renderer REGISTRY rather than a switch in the chat screen: pocketpal
 * dispatches through one too, and that is what makes a fifth tool a
 * registration instead of an edit to the bubble.
 *
 * Registration happens at module load. The chat screen asks for the
 * renderer by name and falls back to the "used X" chip when there is none,
 * so an unregistered tool is never worse off than it is today.
 *
 * Dispatch order — pinned by tests/chat-tool-results.test.ts, and the order
 * that matters:
 *   1. a recorded FAILURE  -> the error block
 *   2. a registered name   -> that tool's surface
 *   3. anything else       -> the "used X" chip
 * An error must never fall through to the chip: that is exactly how a
 * failed tool came to look like a successful one.
 */

import type { ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react-native";

import type { AgentStep } from "../../types/chat.ts";
import { colors } from "../../themes/tokens.ts";

export interface ToolSurfaceProps {
  step: AgentStep;
  expanded: boolean;
  onToggle: () => void;
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

/** The shared collapse affordance. One implementation, so the surfaces
 *  cannot drift into two subtly different controls. */
function Surface({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <View className="basis-full">
      <Pressable
        onPress={onToggle}
        // 48dp: the row is the whole control, not just the chevron.
        className="min-h-12 flex-row items-center gap-2 rounded-lg px-2 py-1"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={label}
        accessibilityHint={expanded ? "Collapses the result" : "Expands the result"}
      >
        {expanded ? (
          <ChevronDown size={14} color={colors.secondaryText} />
        ) : (
          <ChevronRight size={14} color={colors.secondaryText} />
        )}
        <Text className="flex-1 font-sans text-caption text-secondary-text">
          {label}
        </Text>
      </Pressable>
      {expanded && children}
    </View>
  );
}

interface Hit {
  title: string;
  url: string;
  snippet: string;
}

/** Reads the structured hits ticket 02's plumbing carries. A malformed or
 *  absent shape yields an empty list rather than a crash — the data came
 *  from disk and may predate this renderer. */
function hitsOf(step: AgentStep): Hit[] {
  const raw: unknown = step.data?.hits;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (h): h is Hit =>
      typeof h === "object" && h !== null && typeof (h as Hit).url === "string",
  );
}

function WebSearchSurface({ step, expanded, onToggle }: ToolSurfaceProps) {
  const hits = hitsOf(step);
  // The query is already persisted as the tool's own argument, so it is not
  // duplicated into the result payload.
  const query = typeof step.input?.query === "string" ? step.input.query : "";
  const noun = hits.length === 1 ? "1 result" : `${hits.length} results`;
  return (
    <Surface
      label={query === "" ? `web_search — ${noun}` : `web_search “${query}” — ${noun}`}
      expanded={expanded}
      onToggle={onToggle}
    >
      <View className="gap-1 px-2 pb-2">
        {hits.map((hit) => (
          <Pressable
            key={hit.url}
            onPress={() => {
              void Linking.openURL(hit.url).catch(() => {
                /* a dead link must not crash the bubble */
              });
            }}
            className="min-h-12 justify-center rounded-lg px-2 py-1"
            accessibilityRole="link"
            accessibilityLabel={hit.title === "" ? hit.url : hit.title}
            accessibilityHint={hit.snippet === "" ? undefined : hit.snippet}
          >
            <View className="flex-row items-center gap-1">
              <Text
                numberOfLines={2}
                className="flex-1 font-sans text-caption text-primary-text"
              >
                {hit.title === "" ? hit.url : hit.title}
              </Text>
              <ExternalLink size={12} color={colors.secondaryText} />
            </View>
            {hit.snippet !== "" && (
              <Text
                numberOfLines={2}
                className="mt-0.5 font-sans text-micro text-secondary-text"
              >
                {hit.snippet}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </Surface>
  );
}

// Module load, not first render: the chat screen must never be the thing
// that decides a renderer exists.
registerToolSurface("web_search", WebSearchSurface);

/** A short, plain result. The whole value fits in the summary line, so
 *  expanding only shows it again in full -- which is the point: ONE collapse
 *  affordance for every surface, not a second control that drifts. */
function PlainSurface({ step, expanded, onToggle }: ToolSurfaceProps) {
  const text = step.result ?? "";
  return (
    <Surface
      label={text === "" ? step.tool : `${step.tool} — ${text}`}
      expanded={expanded}
      onToggle={onToggle}
    />
  );
}

/** A fetched page. Long by nature -- up to the reader's cap -- so the
 *  summary line carries only that a page was read, and the text itself lives
 *  behind the control. */
function ReadUrlSurface({ step, expanded, onToggle }: ToolSurfaceProps) {
  const text = step.result ?? "";
  // Reported by the seam, never inferred here: a renderer comparing
  // the text length against the cap would silently start lying the day
  // that cap moves. The notice is the difference between a cut-off
  // article and the whole thing.
  const truncated = step.data?.truncated === true;
  return (
    <Surface
      label={truncated ? "read_url — page read, cut off" : "read_url — page read"}
      expanded={expanded}
      onToggle={onToggle}
    >
      <View className="px-2 pb-2">
        {truncated && (
          <Text className="mb-1 font-sans text-micro text-secondary-text">
            Truncated — this is only the start of the page.
          </Text>
        )}
        <Text className="font-sans text-caption text-secondary-text">{text}</Text>
      </View>
    </Surface>
  );
}

registerToolSurface("read_url", ReadUrlSurface);
registerToolSurface("calculate", PlainSurface);
registerToolSurface("datetime", PlainSurface);

/** The default (collapsed) state a bubble should mount surfaces with.
 *  Exported so the chat screen keeps one rule for it. */
export const COLLAPSED_BY_DEFAULT = true;