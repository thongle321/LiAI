/** Wrapping model-authored HTML into a loadable, sandboxed document.
 *
 * Pure, and the security boundary for the HTML preview, so it lives here
 * rather than in the component: this file has no React Native imports and
 * is node-tested, while components/chat/HtmlPreviewBubble.tsx holds the
 * WebView that loads the result. Same split the chat export path uses
 * (lib/chat/export.ts produces content; share-export.ts moves it).
 *
 * PocketParity: HtmlPreviewBubble.tsx:41-120.
 */

export const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:; font-src data:;";

/** Layout overrides every document gets: the preview is a 250px strip or a
 *  fullscreen sheet, never the viewport the author designed for. */
export const PREVIEW_HEAD_INJECTION = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style data-preview-override>
html, body { height: auto !important; min-height: 100% !important; }
body > * { max-width: 100vw; box-sizing: border-box; }
img, video, iframe, svg, canvas { max-width: 100%; height: auto; }
table, pre, code { max-width: 100%; overflow-x: auto; }
</style>`;

/** Only for a FRAGMENT (no <html>): give it a body worth looking at, and
 *  follow the device's colour scheme. */
const FRAGMENT_STYLES = `<style>
body { margin: 0; padding: 12px; font-family: -apple-system, system-ui, Roboto, sans-serif; }
@media (prefers-color-scheme: dark) {
  body { background: #1c1c1e; color: #f5f5f7; }
  a { color: #4ea3ff; }
}
</style>`;

/** Wrap model html into a loadable document, injecting the CSP and viewport
 *  into an existing <head> when there is one.
 *
 *  Every branch MUST emit the CSP: a branch that silently dropped it would
 *  render model-authored markup with no policy at all, which is the one
 *  failure this file exists to prevent. Branches: full document with a
 *  head, a document declaring <html> without one, and a bare fragment. */
export function wrapDocument(html: string): string {
  const trimmed = html.trim();
  const hasHtml = /^<html[\s>]/i.test(trimmed);
  const hasDoctype = /^<!doctype\s/i.test(trimmed);
  if (hasHtml || hasDoctype) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(
        /<head(\s[^>]*)?>/i,
        (match) => `${match}${PREVIEW_HEAD_INJECTION}`,
      );
    }
    if (hasHtml) {
      // A document that declares <html> but no <head> still needs one.
      return trimmed.replace(
        /<html(\s[^>]*)?>/i,
        (match) => `${match}<head>${PREVIEW_HEAD_INJECTION}</head>`,
      );
    }
  }
  // Bare fragment (or something malformed): build the whole document. The
  // fallback is deliberate — an unparseable string still renders as html
  // rather than showing a blank preview.
  return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8" />\n${PREVIEW_HEAD_INJECTION}\n${FRAGMENT_STYLES}\n</head>\n<body>\n${trimmed}\n</body>\n</html>`;
}