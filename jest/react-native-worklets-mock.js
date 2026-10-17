/**
 * A react-native-worklets stand-in for Jest.
 *
 * The real module loads the native worklets unpacker at import time, so any
 * test that reaches a `scheduleOnRN` call dies before its first assertion.
 * Reanimated's own mock covers its surface but not this package's, and
 * react-native-worklets is a direct dependency, not a Reanimated internal.
 *
 * `scheduleOnRN` crosses from the UI runtime back to JS; here there is only
 * one thread, so calling straight through is both the behaviour and the
 * point. `scheduleOnUI` gets the same treatment for the same reason.
 */

module.exports = {
  __esModule: true,
  scheduleOnRN: (fun, ...args) => fun(...args),
  scheduleOnUI: (fun, ...args) => fun(...args),
  runOnJS: (fun) => fun,
  runOnUI: (fun) => fun,
  runOnUIAsync: async (fun, ...args) => fun(...args),
  isWorkletFunction: () => false,
  makeShareableCloneRecursive: (value) => value,
  executeOnUIRuntimeSync: (fun) => fun(),
  createWorkletRuntime: () => ({}),
  runOnRuntime: (_runtime, fun) => fun(),
};