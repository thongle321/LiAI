jest.mock('uniwind', () => ({
  withUniwind: (component: any) => component,
  useResolveClassNames: () => undefined,
  useUniwind: () => ({ theme: 'light' }),
  useCSSVariable: (name: unknown) =>
    Array.isArray(name) ? name.map(() => undefined) : undefined,
}));

jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    usePathname: () => '/',
    useSegments: () => [],
  };
});

jest.mock('expo-constants', () => ({
  default: { expoConfig: {} },
  expoConfig: {},
}));

jest.mock('@expo/ui', () => ({}));