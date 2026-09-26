/** Load-guard: warn before downloads likely to exceed device memory.
 *
 * No native RAM API in the stack, so the ceiling is learned: files up to
 * 1.5x the largest successful download pass silently; beyond that the UI
 * asks for confirmation. Pure + tested.
 */

export const GUARD_MARGIN = 1.5;

export function exceedsLearnedCeiling(fileSize: number, largestSuccessfulBytes: number): boolean {
  if (largestSuccessfulBytes <= 0) return false;
  return fileSize > largestSuccessfulBytes * GUARD_MARGIN;
}
