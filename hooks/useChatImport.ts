/** Session import flow: pick a JSON backup -> validate -> write (G10).
 *
 * Lives in a hook per ARCH (screens compose, hooks/stores hold logic).
 *
 * The picker is restricted to JSON and the file is read as TEXT, never
 * executed. Everything about the contents is untrusted and is validated by
 * `services/chat//import.ts` before the store writes a single row.
 */

import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";

import { useSnackbar } from "../components/snackbar.tsx";
import { useChatStore } from "../store/chat.ts";

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

export function useChatImport(): () => Promise<void> {
  const importSessions = useChatStore((s) => s.importSessions);
  const { showSnackbar } = useSnackbar();

  return async function importChat(): Promise<void> {
    const res = await DocumentPicker.getDocumentAsync({
      // Only our own backups are importable; markdown is a lossy,
      // human-facing rendering and importing it would invent data.
      type: "application/json",
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets?.[0] === undefined) return;

    try {
      const raw = await LegacyFileSystem.readAsStringAsync(res.assets[0].uri);
      const out = await importSessions(raw);
      if (!out.ok) {
        showSnackbar(out.error ?? "Couldn't import that file.", { type: "error" });
        return;
      }
      // Say what was skipped: a partial import the user cannot see would
      // look identical to a complete one, and silently missing messages
      // are the thing they most need to notice.
      const skipped =
        out.skipped > 0 ? ` ${plural(out.skipped, "item")} skipped.` : "";
      showSnackbar(`Imported ${plural(out.imported, "conversation")}.${skipped}`, {
        type: "success",
      });
    } catch {
      showSnackbar("Couldn't read that file.", { type: "error" });
    }
  };
}