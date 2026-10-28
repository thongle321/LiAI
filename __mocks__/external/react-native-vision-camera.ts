/** The react-native-vision-camera boundary under Jest.
 *
 *  Bare-minimum contract of the surface LiAI actually consumes, all as
 *  NAMED exports (screens import `{ useCameraPermission }` etc., so a
 *  default-exported object would hand them `undefined`):
 *  - `Camera` — a null component that answers `onInitialized` once on
 *    mount (the real one fires it when the session initializes), so a
 *    screen can reach its live state.
 *  - `useCameraDevice` — one fake back device: the shape screens gate on
 *    is `device !== undefined`, so `null` (≠ the real hook's idle value)
 *    would sail through the gate and mount a camera that reports no
 *    initialization.
 *  - `useCameraPermission` — already granted, no prompt.
 *  - `useCameraFormat` — selects nothing.
 */

import * as React from "react";

export const Camera = React.forwardRef<
  null,
  { onInitialized?: () => void }
>(function CameraMock(props, _ref) {
  const { onInitialized } = props;
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (!fired.current && onInitialized !== undefined) {
      fired.current = true;
      onInitialized();
    }
  }, [onInitialized]);
  return null;
});

export const useCameraFormat = (): null => null;

export const useCameraPermission = () => ({
  hasPermission: true,
  requestPermission: async () => true,
});

/** The sliver of react-native-vision-camera's CameraDevice that screens
 *  read through the mock: nothing but truthiness — screens gate on
 *  `device !== undefined` and never touch a field, so the fake stays
 *  minimal by design. */
interface CameraDeviceMock {
  name: string;
  position: string;
}

export const useCameraDevice: () => CameraDeviceMock = () => ({
  name: "mock camera",
  position: "back",
});

const mock = {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
};

export default mock;
export { mock };
