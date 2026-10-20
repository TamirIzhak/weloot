import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Home from '@/app/(tabs)/index';
import { TabBarVisibilityProvider } from '@/navigation/TabBarVisibility';

const mockGetDoc = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

jest.mock('@/lib/firebase', () => ({ initFirebase: jest.fn(() => '192.168.1.10') }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderHome(ui: ReactElement = <Home />) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <TabBarVisibilityProvider>{ui}</TabBarVisibilityProvider>
    </SafeAreaProvider>,
  );
}

describe('Home tab', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDoc.mockResolvedValue({ exists: () => false });
  });

  it('shows the wordmark and a welcome state', async () => {
    await renderHome();
    expect(screen.getByText('WeLoot')).toBeTruthy();
    expect(screen.getByText('Welcome to WeLoot')).toBeTruthy();
  });

  it('shows a successful Firestore read in development', async () => {
    await renderHome();
    expect(await screen.findByText('Firestore: OK (emulator @ 192.168.1.10)')).toBeTruthy();
    expect(mockGetDoc).toHaveBeenCalledWith({ path: 'config/app' });
  });

  it('shows the error when the Firestore read fails', async () => {
    mockGetDoc.mockRejectedValue(new Error('[firestore/permission-denied] denied'));
    await renderHome();
    expect(await screen.findByText('Firestore: [firestore/permission-denied] denied')).toBeTruthy();
  });

  it('links to the component kitchen sink in development', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: 'Component kitchen sink' }));
    expect(mockPush).toHaveBeenCalledWith('/dev/kitchen-sink');
  });

  it('labels the dev sample feed as not real listings', async () => {
    await renderHome();
    expect(screen.getByText('Dev sample feed · not real listings')).toBeTruthy();
  });
});
