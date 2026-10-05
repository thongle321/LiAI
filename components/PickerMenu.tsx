/** PickerMenu contract + Metro fallback.
 *
 * Metro resolves `./PickerMenu` to `PickerMenu.ios.tsx` on iOS and
 * `PickerMenu.android.tsx` on Android; nothing on device ever renders this
 * file. It exists so `tsc` (which does not understand platform extensions)
 * has something to resolve, and so both implementations share one
 * interface — a prop added here must be honored by both platform files.
 */

export interface PickerMenuProps<T extends string> {
  /** Row label, for the Android Pressable's accessibility label. */
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Display text for a value. */
  show: (value: T) => string;
}

export function PickerMenu<T extends string>(_: PickerMenuProps<T>) {
  return null;
}
