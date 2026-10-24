import {
  configureGamesIndex,
  GAMES_INDEX_SETTINGS,
  syncGameRecord,
  type AlgoliaAdmin,
} from './gamesIndex';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

const timestamp = (iso: string) => ({ toMillis: () => Date.parse(iso) });
const GAME = {
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps4', 'ps5'],
  platformIds: [48, 167],
  coverImageId: 'co4jni',
  releaseDate: timestamp('2022-02-25T00:00:00Z'),
  genres: ['RPG'],
  altNames: ['エルデンリング'],
  similarGameIds: [1],
  igdbUpdatedAt: 1700000000,
};

function fakeAlgolia() {
  return {
    saveObject: jest.fn(async () => ({})),
    deleteObject: jest.fn(async () => ({})),
    setSettings: jest.fn(async () => ({})),
  } satisfies AlgoliaAdmin;
}

describe('syncGameRecord', () => {
  it('saves a search record for a written game', async () => {
    const algolia = fakeAlgolia();
    await expect(syncGameRecord(algolia, '119133', GAME)).resolves.toBe('saved');
    expect(algolia.saveObject).toHaveBeenCalledWith({
      indexName: 'games',
      body: {
        objectID: '119133',
        title: 'Elden Ring',
        slug: 'elden-ring',
        platforms: ['ps4', 'ps5'],
        coverImageId: 'co4jni',
        releaseYear: 2022,
        genres: ['RPG'],
        altNames: ['エルデンリング'],
      },
    });
  });

  it('leaves out what a game does not have', async () => {
    const algolia = fakeAlgolia();
    await syncGameRecord(algolia, '1', {
      ...GAME,
      coverImageId: undefined,
      releaseDate: undefined,
    });
    const [{ body }] = algolia.saveObject.mock.calls[0] as unknown as [{ body: object }];
    expect(body).not.toHaveProperty('coverImageId');
    expect(body).not.toHaveProperty('releaseYear');
  });

  it('removes the record when the game is deleted or invalid', async () => {
    const algolia = fakeAlgolia();
    await expect(syncGameRecord(algolia, '119133', undefined)).resolves.toBe('deleted');
    await expect(syncGameRecord(algolia, '2', { title: 'Broken' })).resolves.toBe('deleted');
    expect(algolia.deleteObject).toHaveBeenCalledWith({ indexName: 'games', objectID: '119133' });
    expect(algolia.deleteObject).toHaveBeenCalledWith({ indexName: 'games', objectID: '2' });
    expect(algolia.saveObject).not.toHaveBeenCalled();
  });
});

describe('configureGamesIndex', () => {
  it('makes titles and alternative names searchable and platforms filterable', async () => {
    const algolia = fakeAlgolia();
    await configureGamesIndex(algolia);
    expect(algolia.setSettings).toHaveBeenCalledWith({
      indexName: 'games',
      indexSettings: GAMES_INDEX_SETTINGS,
    });
    expect(GAMES_INDEX_SETTINGS.searchableAttributes).toEqual(['title', 'unordered(altNames)']);
    expect(GAMES_INDEX_SETTINGS.attributesForFaceting).toEqual(['filterOnly(platforms)']);
  });
});
