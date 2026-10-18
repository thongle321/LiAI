/** The download arc drawn around an engine card's glyph.
 *
 * PocketPal's header logo takes a `progress` prop (EngineLogo.tsx) and its
 * picker feeds it `ringProgress` (VoicePickerView.tsx). This app's card has
 * no logo image, but it needs the same affordance for the same reason: the
 * progress copy lives in the body, and the body is unmounted while the card
 * is collapsed — so without this the arc is the only way to tell that a
 * closed card is still working. WHEN to draw it is not this component's
 * call; services/tts//voiceUi.ts's `ringFraction` decides, because the arc has
 * to refuse the states the reference never hits.
 *
 * Geometry is the reference's: a faint full-circle track plus one arc,
 * started at twelve o'clock with a -90° rotation and shortened by
 * `strokeDashoffset`. Unlike the chevron (a glyph swap, never a style
 * rotation — see engine-card.tsx) that rotation belongs to the SVG shape, not
 * to a rendered icon, so it is not the transform that failed on device.
 */

import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

/** PocketPal's ring stroke. */
const STROKE = 3;

/** How faint the unfilled track sits under the arc. A progress track, not a
 *  selected element — DESIGN.md's Tint Rule keeps tints for grounds, and
 *  this is the one mark that carries its own extent. */
const TRACK_OPACITY = 0.2;

export function ProgressRing({
  size,
  progress,
  color,
  testID,
}: {
  /** Full diameter, track and arc both. The caller sizes the space for it:
   *  the arc's outer edge is `size` and its stroke eats half a unit of
   *  radius, so `size` must clear whatever it wraps. */
  size: number;
  /** 0..1. Clamped here so a malformed reading draws a whole ring, not a
   *  negative dashoffset that renders nothing. */
  progress: number;
  color: string;
  /** Decorative, so a test needs a handle; nothing announces it. */
  testID?: string;
}) {
  const center = size / 2;
  const radius = center - STROKE / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View className="absolute inset-0">
      <Svg
        width={size}
        height={size}
        pointerEvents="none"
      >
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeOpacity={TRACK_OPACITY}
          strokeWidth={STROKE}
          fill="transparent"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          fill="transparent"
          transform={`rotate(-90 ${center} ${center})`}
          testID={testID}
        />
      </Svg>
    </View>
  );
}