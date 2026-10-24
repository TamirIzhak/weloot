import type { CallableRequest } from 'firebase-functions/v2/https';

import { handleDeleteAccount, type AccountStore } from './deleteAccount';

jest.mock('firebase-functions', () => ({ logger: { info: jest.fn() } }));
jest.mock('firebase-functions/v2/https', () => jest.requireActual('../testing/https'));

const AUTH = { uid: 'u1', token: {}, rawToken: 'raw' } as unknown as CallableRequest['auth'];

function setup() {
  const calls: string[] = [];
  const store: AccountStore = {
    usernameOf: jest.fn(async () => {
      calls.push('usernameOf');
      return 'gamer_1';
    }),
    releaseUsername: jest.fn(async () => {
      calls.push('releaseUsername');
    }),
    deletePrivateData: jest.fn(async () => {
      calls.push('deletePrivateData');
    }),
    tombstoneProfile: jest.fn(async () => {
      calls.push('tombstoneProfile');
    }),
  };
  const auth = {
    deleteUser: jest.fn(async () => {
      calls.push('deleteUser');
    }),
  };
  return { store, auth, calls };
}

describe('handleDeleteAccount', () => {
  it('runs feature cleanups, then deletes data, and deletes the Auth user last', async () => {
    const { store, auth, calls } = setup();
    const cleanup = jest.fn(async () => {
      calls.push('cleanup');
    });
    await expect(handleDeleteAccount(AUTH, { store, auth, cleanups: [cleanup] })).resolves.toEqual({
      deleted: true,
    });
    expect(calls).toEqual([
      'cleanup',
      'usernameOf',
      'releaseUsername',
      'deletePrivateData',
      'tombstoneProfile',
      'deleteUser',
    ]);
    expect(store.releaseUsername).toHaveBeenCalledWith('gamer_1', 'u1');
    expect(auth.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('skips the username for an account that never finished profile setup', async () => {
    const { store, auth } = setup();
    jest.mocked(store.usernameOf).mockResolvedValueOnce(null);
    await handleDeleteAccount(AUTH, { store, auth });
    expect(store.releaseUsername).not.toHaveBeenCalled();
    expect(store.deletePrivateData).toHaveBeenCalledWith('u1');
  });

  it('finishes a retry when the Auth user is already gone', async () => {
    const { store, auth } = setup();
    auth.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'auth/user-not-found' }),
    );
    await expect(handleDeleteAccount(AUTH, { store, auth })).resolves.toEqual({ deleted: true });
  });

  it('keeps the Auth user when a data step fails, so the user can retry', async () => {
    const { store, auth } = setup();
    jest.mocked(store.deletePrivateData).mockRejectedValueOnce(new Error('unavailable'));
    await expect(handleDeleteAccount(AUTH, { store, auth })).rejects.toThrow('unavailable');
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('asks guests to sign in', async () => {
    const { store, auth } = setup();
    await expect(handleDeleteAccount(undefined, { store, auth })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(store.usernameOf).not.toHaveBeenCalled();
  });
});
