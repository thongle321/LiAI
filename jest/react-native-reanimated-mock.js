/**
 * A minimal Reanimated stand-in for Jest.
 *
 * The official `react-native-reanimated/mock` imports native worklets, which
 * do not exist in the Jest environment. The components under test only need
 * animation APIs to exist, not to animate.
 */

const React = require('react');
const { View, Text, ScrollView, FlatList } = require('react-native');

const PROPS_TO_STRIP = new Set([
  'entering',
  'exiting',
  'layout',
  'sharedElement',
  'sharedTransitionTag',
]);

function cleanProps(props) {
  const result = {};
  for (const key of Object.keys(props)) {
    if (!PROPS_TO_STRIP.has(key)) result[key] = props[key];
  }
  return result;
}

function createAnimatedComponent(Component) {
  return React.forwardRef((props, ref) =>
    React.createElement(Component, { ...cleanProps(props), ref }),
  );
}

const AnimatedView = createAnimatedComponent(View);
const AnimatedText = createAnimatedComponent(Text);
const AnimatedScrollView = createAnimatedComponent(ScrollView);
const AnimatedFlatList = createAnimatedComponent(FlatList);

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  ScrollView: AnimatedScrollView,
  FlatList: AnimatedFlatList,
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing: {
    linear: (value) => value,
    ease: (value) => value,
    quad: (value) => value,
    cubic: (value) => value,
    poly: (value) => value,
    sin: (value) => value,
    circle: (value) => value,
    exp: (value) => value,
    elastic: () => 1,
    back: (value) => value,
    bounce: () => 0,
    bezier: () => (value) => value,
    in: (fn) => fn,
    out: (fn) => fn,
    inOut: (fn) => fn,
  },
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedStyle: (styleFn) => styleFn(),
  withTiming: (value) => value,
  withDelay: (_delay, value) => value,
  withSpring: (value) => value,
  withRepeat: (value) => value,
  withSequence: (...values) => values[0],
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  createAnimationBuilder: () => {
    const builder = {};
    const chain = () => builder;
    builder.duration = chain;
    builder.easing = chain;
    builder.spring = chain;
    builder.delay = chain;
    builder.withCallback = chain;
    builder.randomDelay = chain;
    return builder;
  },
};
module.exports.FadeIn = module.exports.createAnimationBuilder();
module.exports.FadeOut = module.exports.createAnimationBuilder();
module.exports.FadeInDown = module.exports.createAnimationBuilder();
module.exports.FadeInUp = module.exports.createAnimationBuilder();
module.exports.FadeOutDown = module.exports.createAnimationBuilder();
module.exports.FadeOutUp = module.exports.createAnimationBuilder();
module.exports.SlideInDown = module.exports.createAnimationBuilder();
module.exports.SlideInUp = module.exports.createAnimationBuilder();
module.exports.SlideOutDown = module.exports.createAnimationBuilder();
module.exports.SlideOutUp = module.exports.createAnimationBuilder();