/**
 * lucide's CommonJS build, so a test can import icons at all.
 *
 * jest-expo resolves the `react-native` export condition, which is
 * lucide's ESM bundle (`dist/esm/*.mjs`), and the preset's only JS
 * transform is `\.[jt]sx?$` — `.mjs` never reaches babel, so the
 * bundle fails to parse in jest's CJS runtime.
 *
 * Re-exported from a repo-owned file rather than pointed at directly in
 * jest.config.js so this is the ONE place that knows lucide's dist
 * layout; a version bump that moves the build breaks here, loudly,
 * instead of as an unresolvable path in the config.
 *
 * These are the real icons — icon glyphs carry no behaviour a test can
 * observe, and stubbing them per-name would mean a new icon import
 * breaks a suite.
 */

module.exports = require('../node_modules/lucide-react-native/dist/cjs/lucide-react-native.js');
