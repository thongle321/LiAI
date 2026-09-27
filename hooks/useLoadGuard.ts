/** Load-guard gate: confirm before downloads above the learned ceiling.
 *
 * Lives in a hook per ARCH (Alert is UI; the predicate is lib).
 */

import { useCallback } from "react";
import { Alert } from "react-native";

import { exceedsLearnedCeiling } from "../lib/load-guard.ts";
import { useModelStore } from "../store/modelStore";

export function useLoadGuard(): (
  sizeBytes: number,
  proceed: () => void,
  cancel?: () => void,
) => void {
  const largestSuccessfulBytes = useModelStore((s) => s.largestSuccessfulBytes);

  // Stable identity: this guard is a dep of a memoized download callback in
  // AvailableModels, so returning a fresh arrow each render would defeat
  // PresetModelCard's memo on every parent re-render.
  return useCallback(
    (sizeBytes, proceed, cancel?) => {
      if (!exceedsLearnedCeiling(sizeBytes, largestSuccessfulBytes)) {
        proceed();
        return;
      }
      Alert.alert(
        "Large model",
        "This file is much larger than models that have downloaded successfully on this device. It may fail or run out of memory.",
        [
          { text: "Cancel", style: "cancel", onPress: () => cancel?.() },
          { text: "Download anyway", onPress: proceed },
        ],
      );
    },
    [largestSuccessfulBytes],
  );
}
