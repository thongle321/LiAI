/** Copy-to-clipboard with transient "copied" feedback.
 *
 * Shared by message actions and code blocks (same shape, one place).
 */

import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";

const FEEDBACK_MS = 1500;

export function useCopy(): {
  copied: boolean;
  copy: (text: string) => void;
} {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(text: string): Promise<void> {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return { copied, copy: (text: string) => void copy(text) };
}
