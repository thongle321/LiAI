/** Reset-menu contract + Metro fallback.
 *
 * Metro resolves `./ResetMenu` to `ResetMenu.ios.tsx` on iOS and
 * `ResetMenu.android.tsx` on Android; nothing on device renders this file.
 * It exists so `tsc` (no platform-extension resolution) has something to
 * resolve — same pattern as PickerMenu. The trigger mirrors PocketPal's
 * session Reset: a text button with a chevron opening two destinations.
 */

export interface ResetMenuItem {
  label: string;
  onPress: () => void;
}

export interface ResetMenuProps {
  items: readonly ResetMenuItem[];
}

export function ResetMenu(_: ResetMenuProps) {
  return null;
}
