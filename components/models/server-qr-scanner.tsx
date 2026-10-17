import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type CameraRuntimeError,
} from "react-native-vision-camera";

import { colors } from "../../themes/tokens.ts";
import { Sheet } from "../sheet.tsx";
import { isServerUrl } from "../../services/models/server-url.ts";

export function ServerQRScanner({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (url: string) => void;
  onClose: () => void;
}) {
  const device = useCameraDevice("back");
  const [cameraFailed, setCameraFailed] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [rejected, setRejected] = useState(false);
  const acceptedRef = useRef(false);

  // Fresh acceptance flag every mount.
  useEffect(() => {
    acceptedRef.current = false;
  }, [visible]);

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (acceptedRef.current) return;
      for (const code of codes) {
        const value = code.value?.trim() ?? "";
        if (!value) continue;
        if (isServerUrl(value)) {
          acceptedRef.current = true;
          onScanned(value);
          break;
        }
        setRejected(true);
      }
    },
  });

  const showCamera = !!device && !cameraFailed;

  const handleCameraError = (error: CameraRuntimeError) => {
    const message = isHardError(error) ? true : false;
    if (message) setCameraFailed(true);
    else setFrameError(true);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Scan server QR code">
      <View className="flex-col items-center gap-3 py-2">
        {!showCamera && (
          <Text className="font-sans text-body-sm text-error">
            {cameraFailed
              ? "Camera unavailable on this device."
              : "No camera available."}
          </Text>
        )}
        {showCamera && device && (
          <View className="h-[280px] w-full overflow-hidden">
            {/* Camera takes no className (third-party native view), so its
                fill stays inline; the frame around it is Uniwind. */}
            <Camera
              device={device}
              isActive={visible}
              codeScanner={codeScanner}
              onError={handleCameraError}
              style={{ flex: 1 }}
            />
          </View>
        )}
        {frameError ? (
          <Text className="font-sans text-body-sm text-warning">
            Camera not ready—adjust lighting.
          </Text>
        ) : null}
        {rejected && !frameError ? (
          <Text className="font-sans text-body-sm text-warning">
            Scanned code is not a server URL. Try again.
          </Text>
        ) : null}
        <Pressable
          onPress={onClose}
          className="btn btn--secondary w-full"
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
        >
          <Text className="font-sans text-body-md text-primary">Close</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function isHardError(error: CameraRuntimeError): boolean {
  const code = String(error.code ?? "").toLowerCase();
  return !code.startsWith("unknown");
}
