/** The notification-permission request a download makes before it starts.
 *
 * Pure seam: the native side is `PermissionsAndroid`, which cannot exist
 * under `node --test`, so the API is injected and this only decides WHAT to
 * ask and what each answer MEANS. The caller never branches on the outcome.
 *
 * Not a gate, deliberately. A refusal, a missing API, or a native throw all
 * resolve like this; none of them stops a transfer. The foreground-service
 * notification is worth asking for — it is the only place download progress
 * is visible outside the app — but a download the user chose is never held
 * hostage to a prompt.
 *
 * Requested per download rather than once and cached, which mirrors the
 * reference app: the user who declined is asked again. Accepted trade-off.
 *
 * Android versions below 13 need no runtime request — the OS answers
 * `granted` immediately and shows nothing, so there is no version check here.
 */

export type NotificationPermissionOutcome = "granted" | "declined" | "unavailable";

/** Generic in the permission type so a caller can hand in its platform's
 *  own permission union (react-native's `Permission`) without a cast. */
export interface NotificationPermissionApi<P = string> {
  /** Platform name, as `Platform.OS` reports it. */
  os: string;
  /** The permission to ask for; null when the platform has none (iOS, or a
   *  build with no permission API at all). */
  permission: P | null;
  /** The native request. Resolves to the OS's answer, or rejects. */
  request: (permission: P) => Promise<string>;
}

export async function requestDownloadNotificationPermission<P>(
  api: NotificationPermissionApi<P>,
): Promise<NotificationPermissionOutcome> {
  if (api.os !== "android" || api.permission === null) return "unavailable";
  try {
    return (await api.request(api.permission)) === "granted" ? "granted" : "declined";
  } catch {
    // A permission API that throws is the same as a refusal: the download
    // runs without a notification, exactly as it does today.
    return "declined";
  }
}
