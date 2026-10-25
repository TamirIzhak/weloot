// Initialize i18n (English, since I18nManager.isRTL is false in Jest) so components render real text.
import '@/i18n';

// Icon fonts can't load in Jest; render the icon name instead so tests can still find icons.
jest.mock('@expo/vector-icons/Ionicons', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => createElement(Text, { testID: `icon-${name}` }, name),
  };
});

// AsyncStorage has no native module in Jest; the package ships an in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Push notifications talk to the native messaging module; tests of other features don't care (push.test.ts
// unmocks it).
jest.mock('@/features/notifications/push', () => ({
  registerForPush: jest.fn(async () => false),
  unregisterPush: jest.fn(async () => undefined),
  watchTokenRefresh: jest.fn(() => () => undefined),
  watchPushes: jest.fn(() => () => undefined),
  targetOf: jest.fn(() => null),
}));

// Sharing opens the native share sheet and logs analytics; feature tests check the buttons through these mocks
// (share.test.ts unmocks it).
jest.mock('@/features/share/share', () => ({
  shareDomain: () => 'weloot.test',
  listingLink: (id: string) => `https://weloot.test/l/${id}`,
  shareListing: jest.fn(async () => undefined),
  shareWantlist: jest.fn(async () => undefined),
}));
