/** Notification permission before a download (ticket 04).
 *
 * Run: node --test tests/notification-permission.test.ts
 *
 * WHY A SOURCE SCAN for the wiring: the start path lives in the models
 * store, which imports expo-file-system and the native download module —
 * neither exists under `node --test`. The DECISION (ask, and what each
 * answer means) is pure and injected, so it is tested directly below; what
 * is guarded here is the WIRING: that the download path asks before the
 * transfer, once per user-initiated start, and never blocks on the answer.
 *
 * Comments are stripped before scanning: this file's own header names the
 * strings several assertions below assert are absent.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

import {
  requestDownloadNotificationPermission,
  type NotificationPermissionApi,
} from "../lib/models/notification-permission.ts";

const ROOT = path.join(import.meta.dirname, "..");
const stripped = (rel: string): string =>
  readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const DOWNLOADS = stripped("store/models/downloads.ts");
const MANIFEST = readFileSync(
  path.join(ROOT, "modules/native-download/android/src/main/AndroidManifest.xml"),
  "utf8",
);

/** A recording stand-in for PermissionsAndroid. */
function api(over: Partial<NotificationPermissionApi> & { answer?: string } = {}) {
  const asked: string[] = [];
  const base: NotificationPermissionApi = {
    os: "android",
    permission: "android.permission.POST_NOTIFICATIONS",
    request: async (p) => {
      asked.push(p);
      return over.answer ?? "granted";
    },
  };
  return { asked, api: { ...base, ...over, request: base.request } };
}

describe("asking for the notification permission", () => {
  it("asks, on Android, and reports a granted answer", async () => {
    const { asked, api: a } = api();
    assert.equal(await requestDownloadNotificationPermission(a), "granted");
    assert.deepEqual(asked, ["android.permission.POST_NOTIFICATIONS"]);
  });

  it("reports a refusal as declined, and never throws", async () => {
    for (const answer of ["denied", "never_ask_again"]) {
      const { api: a } = api({ answer });
      assert.equal(await requestDownloadNotificationPermission(a), "declined", answer);
    }
  });

  it("reports unavailable and asks nothing where no runtime permission exists", async () => {
    const ios = api({ os: "ios" });
    assert.equal(await requestDownloadNotificationPermission(ios.api), "unavailable");
    assert.deepEqual(ios.asked, [], "iOS has no runtime notification permission to ask for");

    const noApi = api({ permission: null });
    assert.equal(await requestDownloadNotificationPermission(noApi.api), "unavailable");
    assert.deepEqual(noApi.asked, [], "a build without the permission API must not reach it");
  });

  it("survives a native request that throws", async () => {
    const a: NotificationPermissionApi = {
      os: "android",
      permission: "android.permission.POST_NOTIFICATIONS",
      request: () => Promise.reject(new Error("no activity")),
    };
    assert.doesNotReject(requestDownloadNotificationPermission(a));
    assert.equal(await requestDownloadNotificationPermission(a), "declined");
  });
});

describe("the download path asks before the transfer", () => {
  it("calls the decision module, not an inline permission call", () => {
    assert.match(
      DOWNLOADS,
      /import \{ requestDownloadNotificationPermission \} from "\.\.\/\.\.\/lib\/models\/notification-permission\.ts"/,
    );
    assert.match(DOWNLOADS, /await requestDownloadNotificationPermission\(/);
    assert.doesNotMatch(
      DOWNLOADS,
      /granted|never_ask_again/,
      "the native answer is the module's business; the store must not decide anything about it",
    );
  });

  it("asks once per user-initiated start, after the duplicate guard and before bytes move", () => {
    const guard = DOWNLOADS.indexOf("live.status === \"downloading\"");
    const ask = DOWNLOADS.indexOf("await requestDownloadNotificationPermission(");
    const start = DOWNLOADS.indexOf("platformDownloadService.startDownload(");
    const refusal = DOWNLOADS.indexOf("!modelFitsOnDevice({");
    assert.ok(guard > 0, "the one-live-job guard is in the start path");
    assert.ok(ask > guard, "a download already in progress must not re-prompt");
    assert.ok(ask > refusal, "a download the pre-flight refuses must never prompt");
    assert.ok(ask < start, "the prompt arrives before the transfer begins");
    assert.equal(
      DOWNLOADS.slice(ask, start).match(/requestDownloadNotificationPermission\(/g)?.length,
      1,
      "one ask per start — the prompt must fire exactly once",
    );
  });

  it("never branches on the answer: this is a request, not a precondition", () => {
    const ask = DOWNLOADS.indexOf("await requestDownloadNotificationPermission(");
    const after = DOWNLOADS.slice(ask, ask + 200);
    assert.doesNotMatch(
      after,
      /granted|declined|unavailable|if \(|return/,
      "gating the download on the answer is the exact failure this ticket exists to prevent",
    );
  });

  it("suppresses the prompt for the projector handoff, which the user did not start", () => {
    assert.match(
      DOWNLOADS,
      /startSpecDownload\(\s*specNow[\s\S]{0,160}?promptForNotifications: false/,
      "the pair handoff is a continuation, not a new user-initiated download",
    );
  });

  it("declares POST_NOTIFICATIONS natively, or the runtime request does nothing", () => {
    assert.match(
      MANIFEST,
      /<uses-permission android:name="android\.permission\.POST_NOTIFICATIONS"/,
      "without the declaration the OS silently drops the request and the notification",
    );
  });
});