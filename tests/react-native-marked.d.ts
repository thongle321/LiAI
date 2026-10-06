// react-native-marked ships types for its public entry, but not for the
// deep util the markdown table test imports. The util is pure JS ({textAlign}
// in, {textAlign} out) and pulls in no react-native, which is exactly why
// it is safe to call from plain Node.
declare module "react-native-marked/dist/module/utils/table.js" {
  export function getTableColAlignmentStyle(
    alignment: "left" | "center" | "right" | undefined,
  ): { textAlign: "left" | "center" | "right" };
}