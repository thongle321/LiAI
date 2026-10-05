/** Local model import flow: pick -> collision choice -> copy + register.
 *
 * Lives in a hook per ARCH (screens compose, hooks/stores hold logic).
 */

import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";

import { numberedFileName } from "../lib/local-model.ts";
import { useSnackbar } from "../components/Snackbar.tsx";
import { useLoadGuard } from "./useLoadGuard.ts";
import { useModelStore } from "../store/modelStore";

export function useLocalModelImport(): () => Promise<void> {
  const addLocalModel = useModelStore((s) => s.addLocalModel);
  const guard = useLoadGuard();
  const { showSnackbar } = useSnackbar();

  return async function importLocalModel(): Promise<void> {
    const res = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];

    let fileName = asset.name;
    const base = LegacyFileSystem.documentDirectory ?? "";
    const exists = async (n: string) =>
      (await LegacyFileSystem.getInfoAsync(`${base}models/local/${n}`)).exists;

    if (await exists(fileName)) {
      const choice = await new Promise<"replace" | "keep" | "cancel">((resolve) =>
        Alert.alert("File already exists", fileName, [
          { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
          { text: "Keep both", onPress: () => resolve("keep") },
          { text: "Replace", onPress: () => resolve("replace") },
        ]),
      );
      if (choice === "cancel") return;
      if (choice === "keep") {
        let n = 2;
        while (await exists(numberedFileName(fileName, n))) n++;
        fileName = numberedFileName(fileName, n);
      }
    }

    const size = asset.size ?? 0;
    const confirmed = await new Promise<boolean>((resolve) => {
      guard(
        size,
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!confirmed) return;

    try {
      await addLocalModel(asset.uri, fileName, size);
    } catch {
      showSnackbar("Could not copy the file into models.", { type: "error" });
    }
  };
}
