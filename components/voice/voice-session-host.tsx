/** The ONE voice session, mounted once (spec: hands-free in chat,
 *  issue 01).
 *
 *  The session controller (hooks/useVoiceMode) used to mount inside the
 *  Voice tab, which made the session that tab's local state — chat could
 *  never start one, and two surfaces could have run two loops. The host
 *  anchors the controller at the tab-layout level: the controller lives
 *  while the tabs live, the Voice tab screen and (later) the chat screen
 *  consume it through useVoiceSession(origin), and a session started on
 *  one surface is the same session everywhere.
 *
 *  It renders nothing — everything sessions show is on the consumer
 *  screens; the store (store/voice-mode.ts) carries the state.
 */

import { useRouter } from "expo-router";

import { useVoiceMode } from "@/hooks/useVoiceMode.ts";

export function VoiceSessionHost() {
  const router = useRouter();
  useVoiceMode({
    openModels: () => router.push("/models"),
  });
  return null;
}
