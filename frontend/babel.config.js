module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Compiles 'worklet' directives (vision frame processor). Same
    // implementation as react-native-reanimated/plugin in v4.
    plugins: ["react-native-worklets/plugin"],
  };
};
