import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

import { fluidTextVariables } from "@/themes/textScale.ts";

/** React seam for the root wrap (app/_layout.tsx): derives the
 * --text-* override map for the device width, re-deriving only when
 * the width changes so the context value handed to ScopedVariables
 * stays stable across renders. */
export function useFluidTextVariables(): Record<string, number> {
  const { width } = useWindowDimensions();
  return useMemo(() => fluidTextVariables(width), [width]);
}
