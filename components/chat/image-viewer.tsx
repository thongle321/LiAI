/** Fullscreen image viewer (PocketParity G15).
 *
 * Tapping an image in a message enlarges it, so a photo you just took can
 * be checked before it is sent — it was stuck at 160x120 px.
 *
 * The reference implementation is `TextMessage.tsx:230-247` (pocketpal's
 * own `ChatView/ImageView.tsx:10-12` is a stub returning an empty `View`,
 * so that gallery path is dead and only the TextMessage one counts).
 *
 * `Modal` takes no `className` — it is on the AGENTS.md exception list —
 * but its CHILDREN are ordinary components and do, so only the Modal
 * itself is left unstyled.
 */

import { Image, Modal, Pressable, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { X } from "lucide-react-native";

import { colors } from "@/themes/tokens.ts";

export function ImageViewer({
  uri,
  onClose,
}: {
  /** Null closes it. */
  uri: string | null;
  onClose: () => void;
}) {
  // The Modal stays mounted so its fade-out animation plays on close;
  // `visible` drives show/hide, and the contents render null when
  // there is no photo to show (D4-9).
  return (
    <Modal
      visible={uri !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {uri !== null && (
        <>
          <StatusBar style="light" />
          {/* accessibilityViewIsModal: without it, a transparent Modal still
              lets VoiceOver reach and activate the chat behind this one, so
              the focus trap people expect from a fullscreen overlay is
              simply absent. */}
          <View className="flex-1" accessibilityViewIsModal>
            {/* `accessible={false}` and NO role: tap-anywhere is a redundant
                convenience, and making the whole backdrop a button put a
                button inside a button, which TalkBack announces twice. The X
                is the real control. */}
            <Pressable onPress={onClose} className="flex-1 bg-black" accessible={false}>
              <Image
                source={{ uri }}
                className="flex-1"
                resizeMode="contain"
                // Without this the image reads as decoration, and a screen
                // reader offers no way to inspect what was photographed.
                accessibilityLabel="Attached photo, enlarged"
              />
            </Pressable>
            {/* A sibling of the backdrop, not a child: the photo can be any
                colour, and a control drawn over it would sit on an unknown
                background. */}
            <View className="absolute left-0 top-0">
              <Pressable
                onPress={onClose}
                className="icon-btn"
                accessibilityRole="button"
                accessibilityLabel="Close image"
                hitSlop={8}
              >
                <X size={24} color={colors.inverseText} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
