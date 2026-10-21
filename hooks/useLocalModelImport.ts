/** Local model import flow: pick -> collision choice -> copy + register.
 *
 * Lives in a hook per ARCH (screens compose, hooks/stores hold logic).
 */

import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";

import { numberedFileName } from "@/services/inference/local-model.ts";
import { useSnackbar } from "@/components/snackbar.tsx";
import { useLoadGuard } from "./useLoadGuard.ts";
import { useModelStore } from "@/store/model-store";

export function useLocalModelImport(): () => Promise<void> {
  const addLocalModel = useModelStore((s) => s.addLocalModel);
  const guard = useLoadGuard();
  const { showSnackbar } = useSnackbar();

  return async function importLocalModel(): Promise<void> {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/octet-stream", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    // Reject anything that isn't a GGUF model before we copy multi-GB
    // files into the app cache (D5-7).
    if (!asset.name.toLowerCase().endsWith(".gguf")) {
      showSnackbar("Only .gguf model files can be imported", { type: "error" });
      return;
    }

    let fileName = asset.name;
    const base = LegacyFileSystem.documentDirectory ?? "";
    const exists = async (n: string) =>
      (await LegacyFileSystem.getInfoAsync(`${base}models/local/${n}`)).exists;

    if (await exists(fileName)) {
      // PocketParity: en.json models.fileManagement.* — the message ASKS
      // the question rather than restating the filename, and the buttons
      // carry their own capitalisation.
      const choice = await new Promise<"replace" | "keep" | "cancel">((resolve) =>
        Alert.alert(
          "File already exists",
          "A file with this name already exists. What would you like to do?",
          [
            // The reference's order (ModelsScreen.tsx:213-228): Replace,
            // Keep Both, Cancel — iOS renders the array left to right.
            { text: "Replace", onPress: () => resolve("replace") },
            { text: "Keep Both", onPress: () => resolve("keep") },
            { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
          ],
        ),
      );
      if (choice === "cancel") return;
      if (choice === "keep") {
        // Count from 1, as the reference does (ModelsScreen.tsx:231-244).
        let n = 1;
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
      // The reference's copy notice is a STICKY snackbar for the whole copy
      // (`duration={86400000}`, ModelsScreen.tsx:438-444): a multi-GB file
      // takes minutes, and a toast that expires first would leave a long
      // silence that reads as a hang. 60s carries the same intent without
      // being effectively permanent.
      showSnackbar("Copying model file...", { type: "info", duration: 60000 });
      await addLocalModel(asset.uri, fileName, size);
      showSnackbar("Model added.", { type: "success" });
    } catch {
      showSnackbar("Failed to copy model file", { type: "error" });
    }
  };
}
