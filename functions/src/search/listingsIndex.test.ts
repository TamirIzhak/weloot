import { syncListingRecord } from './listingsIndex';
import type { AlgoliaAdmin } from './gamesIndex';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

const at = (ms: number) => ({ toMillis: () => ms });
const LISTING = {
  userId: 'u1',
  igdbGameId: 119133,
  platform: 'ps5',
  gameTitle: 'Elden Ring',
  condition: 'good',
  hasCase: true,
  notes: '',
  isForTrade: true,
  isForSale: false,
  photoPaths: [],
  hasPhotos: false,
  status: 'active',
  location: { lat: 32.08, lng: 34.78, geohash: 'sv8wr', areaName: 'Tel Aviv' },
  createdAt: at(1_700_000_000_000),
  updatedAt: at(1_700_000_000_000),
};

function fakeAlgolia() {
  return {
    saveObject: jest.fn(async () => ({})),
    deleteObject: jest.fn(async () => ({})),
    setSettings: jest.fn(async () => ({})),
  } satisfies AlgoliaAdmin;
}

describe('syncListingRecord', () => {
  it('saves an active listing at area level, without notes or photo paths', async () => {
    const algolia = fakeAlgolia();
    await expect(syncListingRecord(algolia, 'l1', LISTING)).resolves.toBe('saved');
    const [{ indexName, body }] = algolia.saveObject.mock.calls[0] as unknown as [
      { indexName: string; body: Record<string, unknown> },
    ];
    expect(indexName).toBe('listings');
    expect(body).toMatchObject({
      objectID: 'l1',
      areaName: 'Tel Aviv',
      _geoloc: { lat: 32.08, lng: 34.78 },
      hasPhotos: false,
    });
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('photoPaths');
    expect(body).not.toHaveProperty('location');
  });

  it.each(['paused', 'reserved', 'traded', 'sold', 'removed'])(
    'takes a %s listing out of search',
    async (status) => {
      const algolia = fakeAlgolia();
      await expect(syncListingRecord(algolia, 'l1', { ...LISTING, status }, LISTING)).resolves.toBe(
        'deleted',
      );
      expect(algolia.deleteObject).toHaveBeenCalledWith({ indexName: 'listings', objectID: 'l1' });
      expect(algolia.saveObject).not.toHaveBeenCalled();
    },
  );

  it('removes a deleted or broken listing', async () => {
    const algolia = fakeAlgolia();
    await expect(syncListingRecord(algolia, 'l1', undefined, LISTING)).resolves.toBe('deleted');
    await expect(syncListingRecord(algolia, 'l1', { ...LISTING, platform: 'n64' })).resolves.toBe(
      'deleted',
    );
    expect(algolia.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('costs nothing when the record did not change', async () => {
    const algolia = fakeAlgolia();
    const touched = { ...LISTING, updatedAt: at(1_800_000_000_000) };
    await expect(syncListingRecord(algolia, 'l1', touched, LISTING)).resolves.toBe('unchanged');
    expect(algolia.saveObject).not.toHaveBeenCalled();
  });

  it('re-saves when photos arrive (they rank first)', async () => {
    const algolia = fakeAlgolia();
    const withPhotos = { ...LISTING, hasPhotos: true, photoPaths: ['listings/l1/0.jpg'] };
    await expect(syncListingRecord(algolia, 'l1', withPhotos, LISTING)).resolves.toBe('saved');
  });

  it('follows the current doc, so a late "active" event cannot bring back a paused listing', async () => {
    const algolia = fakeAlgolia();
    // The handler passes the doc as it is now (paused), whatever the event's snapshot said.
    await syncListingRecord(algolia, 'l1', { ...LISTING, status: 'paused' }, undefined);
    expect(algolia.saveObject).not.toHaveBeenCalled();
    expect(algolia.deleteObject).toHaveBeenCalled();
  });
});
