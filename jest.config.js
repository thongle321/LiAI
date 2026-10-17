module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest/setupFilesAfterEnv.ts'],
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/pocketpal-ai/'],
  modulePathIgnorePatterns: ['<rootDir>/pocketpal-ai'],
  // Coverage collection is on so the baseline is measurable while the
  // jest-test-migration coverage tickets (09-17) land. NO threshold yet:
  // gates stay off until there is a real number to gate on, which is the
  // decision recorded in .scratch/jest-test-migration/spec.md. Barrels,
  // style and type files carry no behaviour worth counting, same exclusions
  // the reference app uses.
  collectCoverage: true,
  collectCoverageFrom: [
    '{app,components,services,utils,store,hooks}/**/*.{ts,tsx}',
    '!**/index.{ts,tsx}',
    '!**/__tests__/**',
    '!**/*.d.ts',
  ],
  coverageReporters: ['text-summary'],
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|expo-(.*)|@expo|@expo-(.*)|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|uniwind|tailwindcss|react-native-vision-camera|react-native-reanimated|react-native-worklets|react-native-gesture-handler|@lodev09/react-native-true-sheet|llama\\.rn|@dr\\.pogodin/react-native-fs|react-native-keyboard-controller|react-native-marked|react-native-code-highlighter|react-native-sherpa-onnx|tinybase)/)',
    'node_modules/react-native-reanimated/plugin/',
    'node_modules/@react-native/babel-preset/',
  ],
  moduleNameMapper: {
    // Mirrors tsconfig.json's "paths": { "@/*": ["./*"] }. Metro resolves
    // those itself; jest has to be told. First so it wins over anything below.
    '^@/(.*)$': '<rootDir>/$1',
    '\\.css$': '<rootDir>/jest/styleMock.js',
    'react-native/setup-env': '<rootDir>/jest/react-native-setup-env.js',
    'llama.rn': '<rootDir>/__mocks__/external/llama.rn.ts',
    'react-native-vision-camera':
      '<rootDir>/__mocks__/external/react-native-vision-camera.ts',
    '@lodev09/react-native-true-sheet':
      '@lodev09/react-native-true-sheet/mock',
    'react-native-reanimated':
      '<rootDir>/jest/react-native-reanimated-mock.js',
    // lucide is ESM-only under jest-expo's resolver, and the preset never
    // transforms `.mjs`. Same icons, loadable form — see the shim.
    '^lucide-react-native$': '<rootDir>/jest/lucide-react-native.js',
    // Loads the native worklets unpacker at import time, so any test that
    // reaches a scheduleOnRN call dies before its first assertion. Reanimated's
    // mock above does not cover this package's surface.
    '^react-native-worklets$': '<rootDir>/jest/react-native-worklets-mock.js',
    '@dr.pogodin/react-native-fs':
      '<rootDir>/__mocks__/external/@dr.pogodin/react-native-fs.js',
    'react-native-marked':
      '<rootDir>/__mocks__/external/react-native-marked.js',
    'react-native-code-highlighter':
      '<rootDir>/__mocks__/external/react-native-code-highlighter.js',
    'react-native-sherpa-onnx':
      '<rootDir>/__mocks__/external/react-native-sherpa-onnx.js',
    '@kesha-antonov/react-native-background-downloader':
      '<rootDir>/__mocks__/external/@kesha-antonov/react-native-background-downloader.js',
    // Anchored: subpath imports (`@expo/ui/jetpack-compose`) resolve to the
    // real platform module, not this universal stub.
    '^@expo/ui$': '<rootDir>/__mocks__/external/@expo/ui.tsx',
    '^expo-speech$': '<rootDir>/__mocks__/external/expo-speech.ts',
    '^expo-speech-recognition$':
      '<rootDir>/__mocks__/external/expo-speech-recognition.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/external/expo-sqlite.ts',
    '^expo-linking$': '<rootDir>/__mocks__/external/expo-linking.ts',
    '^expo-font$': '<rootDir>/__mocks__/external/expo-font.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};