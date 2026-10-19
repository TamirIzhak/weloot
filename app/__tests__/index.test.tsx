import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

const mockGetDoc = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

jest.mock('@/lib/firebase', () => ({ initFirebase: jest.fn(() => '192.168.1.10') }));

describe('Index', () => {
  beforeEach(() => mockGetDoc.mockReset());

  it('renders the WeLoot wordmark', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    await render(<Index />);
    expect(screen.getByText('WeLoot')).toBeTruthy();
  });

  it('shows a successful Firestore read in development', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    await render(<Index />);
    expect(await screen.findByText('Firestore: OK (emulator @ 192.168.1.10)')).toBeTruthy();
    expect(mockGetDoc).toHaveBeenCalledWith({ path: 'config/app' });
  });

  it('shows the error when the Firestore read fails', async () => {
    mockGetDoc.mockRejectedValue(new Error('[firestore/permission-denied] denied'));
    await render(<Index />);
    expect(await screen.findByText('Firestore: [firestore/permission-denied] denied')).toBeTruthy();
  });
});
