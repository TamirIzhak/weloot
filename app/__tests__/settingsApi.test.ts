import type * as Links from '@/features/profile/links';
import { updateSettings } from '@/features/profile/settingsApi';

const mockUpdateDoc = jest.fn();

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  onSnapshot: jest.fn(),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteField: () => 'DELETE_FIELD',
  serverTimestamp: () => 'SERVER_TIME',
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateDoc.mockResolvedValue(undefined);
});

describe('updateSettings', () => {
  it('writes one change with a fresh updatedAt', async () => {
    await updateSettings('u1', { searchRadiusKm: 50 });
    expect(mockUpdateDoc).toHaveBeenCalledWith('users/u1/private/settings', {
      searchRadiusKm: 50,
      updatedAt: 'SERVER_TIME',
    });
  });

  it('records the consent time on opt-in and removes it on opt-out', async () => {
    await updateSettings('u1', { marketingOptIn: true });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith('users/u1/private/settings', {
      marketingOptIn: true,
      marketingOptInAt: 'SERVER_TIME',
      updatedAt: 'SERVER_TIME',
    });
    await updateSettings('u1', { marketingOptIn: false });
    expect(mockUpdateDoc).toHaveBeenLastCalledWith('users/u1/private/settings', {
      marketingOptIn: false,
      marketingOptInAt: 'DELETE_FIELD',
      updatedAt: 'SERVER_TIME',
    });
  });
});

describe('support and legal links', () => {
  function load(env: Record<string, string>): typeof Links {
    const keys = [
      'EXPO_PUBLIC_SUPPORT_WHATSAPP',
      'EXPO_PUBLIC_SUPPORT_EMAIL',
      'EXPO_PUBLIC_TERMS_URL',
      'EXPO_PUBLIC_PRIVACY_URL',
    ];
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, env);
    let mod: typeof Links | undefined;
    jest.isolateModules(() => {
      mod = jest.requireActual<typeof Links>('@/features/profile/links');
    });
    if (!mod) throw new Error('not loaded');
    return mod;
  }

  it('builds a WhatsApp link with the prefilled message', () => {
    const links = load({ EXPO_PUBLIC_SUPPORT_WHATSAPP: '+972-50-000-0000' });
    expect(links.supportWhatsAppUrl('Hi (ID: u1)')).toBe(
      'https://wa.me/972500000000?text=Hi%20(ID%3A%20u1)',
    );
  });

  it('builds a mailto link', () => {
    const links = load({ EXPO_PUBLIC_SUPPORT_EMAIL: 'help@weloot.example' });
    expect(links.supportEmailUrl('Help', 'ID: u1')).toBe(
      'mailto:help@weloot.example?subject=Help&body=ID%3A%20u1',
    );
  });

  it('fills the language into legal URLs', () => {
    const links = load({
      EXPO_PUBLIC_TERMS_URL: 'https://weloot.example/{lang}/terms',
      EXPO_PUBLIC_PRIVACY_URL: 'https://weloot.example/privacy',
    });
    expect(links.legalUrl('terms', 'he')).toBe('https://weloot.example/he/terms');
    expect(links.legalUrl('privacy', 'en')).toBe('https://weloot.example/privacy');
  });

  it('has no links until they are configured', () => {
    const links = load({});
    expect(links.supportWhatsAppUrl('x')).toBeNull();
    expect(links.supportEmailUrl('x', 'y')).toBeNull();
    expect(links.legalUrl('terms', 'en')).toBeNull();
  });
});
