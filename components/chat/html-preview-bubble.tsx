/** Model-authored HTML, rendered as a sandboxed preview in the reply.
 *
 * PocketParity: pocketpal-ai/src/components/HtmlPreviewBubble. Two views of
 * the same document — a fixed-height WebView in the bubble, and a
 * fullscreen modal — plus a shared "show source" toggle and a copy action.
 *
 * The sandboxing is the point, so it is worth stating exactly what it is:
 *
 *   - `javaScriptEnabled={false}` in the bubble. CSP alone is NOT enough:
 *     the policy has to allow inline script for the fullscreen mode, so the
 *     bubble's enforcement is the flag, not the meta tag.
 *   - `originWhitelist={['about:blank']}` plus an
 *     `onShouldStartLoadWithRequest` that only permits `about:blank`, so a
 *     document cannot navigate itself anywhere or pull a remote origin.
 *   - CSP `default-src 'none'` — no network at all; only inline style and
 *     `data:` images/fonts.
 *
 * So the fullscreen mode can run MODEL-WRITTEN script, which can burn CPU
 * and drain battery, but it cannot exfiltrate anything: there is no origin
 * to send it to. (pocketpal has the same exposure and documents it the same
 * way, HtmlPreviewBubble.tsx:69-79.)
 *
 * The source view reuses CodeBlock — the same highlighter the rest of the
 * app uses — rather than pocketpal's atomOneDark, which this app's code
 * surface deliberately retired.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Code2, Copy, Maximize2, Minimize2 } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { wrapDocument } from "../../utils/preview-document.ts";
import { CodeBlock } from "./code-block.tsx";

// Soft cap on concurrently live WebViews to avoid memory pressure on
// budget devices (D6-13). Past the cap, fall back to the CodeBlock branch.
const MAX_LIVE_WEBVIEWS = 4;
let liveWebViewCount = 0;

export function HtmlPreviewBubble({
  html,
  title,
}: {
  html: string;
  title?: string;
}) {
  const [showCode, setShowCode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // Whether this bubble got a slot in the live-WebView cap. Claimed on
  // mount, released on unmount; past the cap we render the source view.
  const slotClaimed = useRef(false);
  const [liveAllowed, setLiveAllowed] = useState(true);
  useEffect(() => {
    if (liveWebViewCount < MAX_LIVE_WEBVIEWS) {
      liveWebViewCount += 1;
      slotClaimed.current = true;
      setLiveAllowed(true);
    } else {
      slotClaimed.current = false;
      setLiveAllowed(false);
    }
    return () => {
      if (slotClaimed.current) {
        liveWebViewCount = Math.max(0, liveWebViewCount - 1);
        slotClaimed.current = false;
      }
    };
  }, []);
  const displayTitle = title !== undefined && title !== "" ? title : "Preview";
  const wrappedHtml = useMemo(() => wrapDocument(html), [html]);

  const copyHtml = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // The RAW html, not the wrapper: the wrapper is ours, not the author's.
    void Clipboard.setStringAsync(html).catch(() => {});
  }, [html]);

  const toggleCode = useCallback(() => {
    setShowCode((v) => !v);
  }, []);

  // Only about:blank may load. Anything else is a document trying to
  // navigate or pull a remote origin, and is refused.
  const onlyAboutBlank = useCallback(
    (req: { url: string }) => req.url === "about:blank",
    [],
  );

  const header = (full: boolean) => (
    <View className="flex-row items-center gap-1 border-b border-border px-3 py-1">
      <Text
        numberOfLines={1}
        className="flex-1 font-sans-semibold text-body-sm text-primary-text"
      >
        {displayTitle}
      </Text>
      <Pressable
        onPress={toggleCode}
        className="h-9 w-9 items-center justify-center"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={showCode ? "Show rendered preview" : "Show HTML code"}
      >
        <Code2
          size={full ? 22 : 18}
          color={showCode ? colors.primary : colors.secondaryText}
        />
      </Pressable>
      <Pressable
        onPress={copyHtml}
        className="h-9 w-9 items-center justify-center"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Copy HTML"
      >
        <Copy size={full ? 22 : 18} color={colors.secondaryText} />
      </Pressable>
      <Pressable
        onPress={() => (full ? setFullscreen(false) : setFullscreen(true))}
        className="h-9 w-9 items-center justify-center"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={full ? "Close preview" : `Open fullscreen: ${displayTitle}`}
      >
        {full ? (
          <Minimize2 size={full ? 22 : 18} color={colors.secondaryText} />
        ) : (
          <Maximize2 size={full ? 22 : 18} color={colors.secondaryText} />
        )}
      </Pressable>
    </View>
  );

  return (
    <>
      <View className="mt-2 self-stretch overflow-hidden rounded-card border border-border bg-surface-1">
        {header(false)}
        {showCode || !liveAllowed ? (
          <ScrollView className="max-h-[250px]">
            <CodeBlock language="html" text={html} />
          </ScrollView>
        ) : (
          <WebView
            source={{ html: wrappedHtml, baseUrl: "about:blank" }}
            // JS OFF here. The CSP permits inline script for the fullscreen
            // mode, so this flag is what actually sandboxes the bubble.
            javaScriptEnabled={false}
            originWhitelist={["about:blank"]}
            onShouldStartLoadWithRequest={onlyAboutBlank}
            scrollEnabled
            style={{ height: 250, width: "100%", backgroundColor: colors.surface1 }}
            testID="html-preview-webview"
          />
        )}
      </View>

      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
        testID="html-preview-modal"
      >
        {/* Modal is a separate hierarchy, so the insets provider is
            re-provided here (PocketParity: HtmlPreviewBubble.tsx:252). */}
        <SafeAreaProvider>
          <SafeAreaView
            edges={["top", "bottom", "left", "right"]}
            className="flex-1 bg-surface-1"
          >
            {header(true)}
            {showCode ? (
              <ScrollView className="flex-1">
                <CodeBlock language="html" text={html} />
              </ScrollView>
            ) : (
              <WebView
                source={{ html: wrappedHtml, baseUrl: "about:blank" }}
                // The ONLY difference from the bubble: JS is allowed, and
                // the user asked for this view explicitly.
                javaScriptEnabled
                originWhitelist={["about:blank"]}
                onShouldStartLoadWithRequest={onlyAboutBlank}
                scrollEnabled
                style={{ flex: 1, backgroundColor: colors.surface1 }}
                testID="html-preview-modal-webview"
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}