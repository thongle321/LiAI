/** The session's mic-mute switch (reference VoiceModeView controls): a
 *  round control that toggles the capture without ending the session.
 *  The muted state is the error-tinted pressed look; unmuted rides on
 *  Surface 2. Size slots: 64 px in the full view (reference CONTROL_SIZE),
 *  48 px in the collapsed bar.
 */

import { Pressable } from "react-native";
import { Mic, MicOff } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";

const SIZES = { full: 64, bar: 48 } as const;

interface VoiceMuteControlProps {
  muted: boolean;
  onToggle: () => void;
  size?: keyof typeof SIZES;
}

export function VoiceMuteControl({
  muted,
  onToggle,
  size = "full",
}: VoiceMuteControlProps): React.JSX.Element {
  const px = SIZES[size];
  const iconSize = size === "full" ? 24 : 20;
  const colors = useColors();
  // The flip animates through the press feedback, not a spinner: the swap
  // is state-driven and instant inside the circle.
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityLabel="Toggle microphone"
      accessibilityState={{ checked: !muted }}
      testID="voice-mute"
      className="rounded-full items-center justify-center active:opacity-80"
      style={{
        width: px,
        height: px,
        backgroundColor: muted ? colors.warmSurface : colors.surface2,
      }}
    >
      {muted ? (
        <MicOff size={iconSize} color={colors.warmAccent} />
      ) : (
        <Mic size={iconSize} color={colors.primaryText} />
      )}
    </Pressable>
  );
}
