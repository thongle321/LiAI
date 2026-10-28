// react-native-gesture-handler ships types for its public entry only, not
// for the jestSetup side-effect module the harness imports (jest/setup.ts):
// with customConditions cleared the subpath resolves to jestSetup.js, whose
// types are absent from the package's `types` field.
declare module "react-native-gesture-handler/jestSetup";
