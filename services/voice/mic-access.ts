/** Mic permission gate for speech recognition (Android RECORD_AUDIO).
 *
 * The OS popup appears only while undetermined; a permanent denial
 * never pops up again, so calling start() there only burns a session
 * (and risks extending a throttle ban) — route to Settings instead.
 * Kept out of voiceListen.ts so its pure helpers stay testable in
 * plain node (this imports the native module).
 */
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Linking } from "react-native";

export type MicAccess = "granted" | "settings" | "unavailable";

export async function ensureMicAccess(): Promise<MicAccess> {
  try {
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (current.granted) return "granted";
    if (!current.canAskAgain) return "settings";
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted ? "granted" : "settings";
  } catch {
    // Native module absent (stale dev build): nothing to ask.
    return "unavailable";
  }
}

/** Straight to this app's OS settings — the only affordance a PERMANENT
 *  mic denial gets (PocketPal openMicSettings). Fire-and-forget: a failed
 *  open leaves the error snackbar's affordance inert, nothing worse. */
export function openMicPermissionSettings(): void {
  void Linking.openSettings().catch(() => {});
}
