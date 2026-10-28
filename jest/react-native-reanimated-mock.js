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
  // A derived value re-evaluates on read: shared values are plain objects
  // in this mock, so the worklet body runs live on every .value access —
  // useKeyboardLift's occlusion arithmetic reads true numbers.
  useDerivedValue: (fn) => ({ get value() { return fn(); } }),
  // Frame callbacks exist but never fire under Jest — nothing animates at
  // the boundary. The only call surface the components under test make is
  // `setActive` (gating a callback on a phase toggle).
  useFrameCallback: (cb) => {
    void cb;
    return { setActive: (_active) => {}, update: () => {} };
  },
  useAnimatedStyle: (styleFn) => styleFn(),
  // The real useEvent wraps the handler in a WorkletEventHandler and is
  // attached as an event prop (RNGH's GestureDetector does exactly that):
  // give it the same object shape. The worklet never RUNS here — the
  // gesture-handler module mocks drive the state instead.
  useEvent: (handler, eventNames = []) => ({
    workletEventHandler: {
      // A Map of event name → handler, as WorkletEventHandler keeps them.
      handlers: new Map(eventNames.map((name) => [name, handler])),
    },
  }),
  // Run the worklet body against a plain event so the component still
  // exercises it. Shared values are mutable objects in this mock, so the
  // bookkeeping a scroll handler does survives the call.
  useAnimatedScrollHandler:
    (handler) =>
    (event) =>
      handler(event),
  // `prepare` runs once on mount and `react` sees `previous === undefined`,
  // matching the real hook's first pass (null there, undefined here — both
  // are "no previous value" and both are guarded). Later passes never fire
  // because nothing re-runs it; that is the mock's one honest limitation and
  // is why the hysteresis is not unit-tested through this seam.
  useAnimatedReaction: (prepare, react) => {
    react(prepare(), undefined);
    return () => undefined;
  },
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
module.exports.Layout = module.exports.createAnimationBuilder();
module.exports.LinearTransition = module.exports.createAnimationBuilder();
module.exports.ZoomIn = module.exports.createAnimationBuilder();
module.exports.FadeInDown = module.exports.createAnimationBuilder();
module.exports.FadeInUp = module.exports.createAnimationBuilder();
module.exports.FadeOutDown = module.exports.createAnimationBuilder();
module.exports.FadeOutUp = module.exports.createAnimationBuilder();
module.exports.SlideInDown = module.exports.createAnimationBuilder();
module.exports.SlideInUp = module.exports.createAnimationBuilder();
module.exports.SlideOutDown = module.exports.createAnimationBuilder();
module.exports.SlideOutUp = module.exports.createAnimationBuilder();
module.exports.withRepeat = (animation) => animation;
module.exports.useReducedMotion = () => false;