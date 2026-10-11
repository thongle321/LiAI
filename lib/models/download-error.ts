/** What failed, in words the user can act on (issue 01, gap C1).
 *
 * Pure seam: LiAI stores a raw error STRING on the spec
 * (`spec.error` — `HTTP 401`, `Not enough storage space…`,
 * `Size mismatch…`), so the dialog's branches are derived from it the
 * same way PocketPal derives its codes from messages
 * (`utils/errors.ts createErrorState`): regex over the string, never a
 * typed error the store does not carry.
 *
 * Node-testable, so the branch table is an assertion rather than a
 * device check.
 */

export type DownloadErrorBranch =
  | "storage"
  | "authentication"
  | "authorization"
  | "server"
  | "integrity"
  | "other";

/** Which branch a stored failure reason belongs to. Order matters: the
 *  storage sentence contains no HTTP status, and the status prefixes are
 *  exact — a body that merely mentions "401" is not an auth failure. */
export function downloadErrorBranch(message: string): DownloadErrorBranch {
  if (/storage|not enough space|disk space/i.test(message)) return "storage";
  if (/^HTTP 401\b/.test(message)) return "authentication";
  if (/^HTTP 403\b/.test(message)) return "authorization";
  if (/^HTTP 5\d\d\b/.test(message)) return "server";
  if (/size mismatch/i.test(message)) return "integrity";
  return "other";
}

/** Title + body + numbered fix-it steps for one failure. The raw message is
 *  KEPT where it adds information (integrity's retry instruction, unknown
 *  failures) rather than hidden behind invented copy.
 *
 *  The steps are LiAI's own English: PocketPal reads the equivalent strings
 *  from `locales/en.json` (`downloadErrorDialog.forbiddenSteps`,
 *  `getTokenSteps`) and this app has no l10n layer. Only branches with a
 *  concrete user action get them — "server" and "other" have nothing to
 *  walk through, so they get none. */
export function downloadErrorCopy(message: string): {
  title: string;
  body: string;
  steps: string[];
} {
  switch (downloadErrorBranch(message)) {
    case "storage":
      return {
        title: "Not enough storage",
        body: "Free up space on this device, then try again.",
        steps: [
          "Delete a model you no longer use, or clear app storage in system Settings.",
        ],
      };
    case "authentication":
      return {
        title: "Authentication failed",
        body: "Your Hugging Face token looks invalid or expired. Update it in Settings, then try again.",
        steps: [
          "Open Settings and edit your Hugging Face token.",
          "Confirm the token has not expired — Hugging Face tokens can be revoked.",
          "Try again. If it still fails, retry without a token for public models.",
        ],
      };
    case "authorization":
      return {
        title: "Access denied",
        body: "The server refused this download. Check your Hugging Face token has access to this model, then try again.",
        steps: [
          "Accept the model's licence on Hugging Face while signed in.",
          "Confirm your token can read gated or private repositories.",
          "Try again — access is granted the moment the licence is accepted.",
        ],
      };
    case "server":
      return {
        title: "Server error",
        body: `The server had a problem (${message}). Try again in a moment.`,
        steps: [],
      };
    case "integrity":
      return { title: "Download incomplete", body: message, steps: [] };
    case "other":
      return { title: "Download failed", body: message, steps: [] };
  }
}
