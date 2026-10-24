import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { GameSearch } from '@/features/catalog/GameSearch';
import { GAME_SEARCH_DELAY_MS } from '@/features/search/useGameSearch';

const mockSearch = jest.fn();
let mockConfigured = true;

jest.mock('@/features/search/algolia', () => ({
  isSearchConfigured: () => mockConfigured,
  searchClient: () => (mockConfigured ? { searchForHits: mockSearch } : null),
}));

const ELDEN_RING = {
  objectID: '119133',
  title: 'Elden Ring',
  slug: 'elden-ring',
  platforms: ['ps5', 'xbox_series'],
  coverImageId: 'co4jni',
  releaseYear: 2022,
  genres: ['RPG'],
  altNames: [],
};

const hits = (...records: unknown[]) => ({ results: [{ hits: records }] });

async function type(text: string) {
  await fireEvent.changeText(screen.getByTestId('game-search-input'), text);
  await act(async () => {
    jest.advanceTimersByTime(GAME_SEARCH_DELAY_MS);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockConfigured = true;
  mockSearch.mockResolvedValue(hits(ELDEN_RING));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('GameSearch', () => {
  it('starts with a hint and searches once typing pauses', async () => {
    await render(<GameSearch />);
    expect(screen.getByText('Type a game’s name. Typos are fine.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('game-search-input'), 'eld');
    await fireEvent.changeText(screen.getByTestId('game-search-input'), 'elden');
    expect(screen.getByTestId('game-search-loading')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(GAME_SEARCH_DELAY_MS);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith({
      requests: [{ indexName: 'games', query: 'elden', hitsPerPage: 20 }],
    });
    expect(screen.getByText('Elden Ring')).toBeTruthy();
    expect(screen.getByText('2022')).toBeTruthy();
    const results = within(screen.getByTestId('game-search-results'));
    expect(results.getByText('PS5')).toBeTruthy();
    expect(results.getByText('Xbox Series X|S')).toBeTruthy();
  });

  it('filters by the chosen platform', async () => {
    await render(<GameSearch />);
    await fireEvent.press(screen.getByTestId('game-search-platform-switch'));
    await type('zelda');
    expect(mockSearch).toHaveBeenCalledWith({
      requests: [
        { indexName: 'games', query: 'zelda', hitsPerPage: 20, filters: 'platforms:switch' },
      ],
    });
  });

  it('uses a fixed platform without showing filter chips', async () => {
    await render(<GameSearch platform="ps5" />);
    expect(screen.queryByTestId('game-search-platform-ps5')).toBeNull();
    await type('elden');
    expect(mockSearch).toHaveBeenCalledWith({
      requests: [{ indexName: 'games', query: 'elden', hitsPerPage: 20, filters: 'platforms:ps5' }],
    });
  });

  it('reports the chosen game', async () => {
    const onSelect = jest.fn();
    await render(<GameSearch onSelect={onSelect} />);
    await type('elden');
    await fireEvent.press(screen.getByTestId('game-119133'));
    expect(onSelect).toHaveBeenCalledWith(ELDEN_RING);
  });

  it('shows an empty state, drops malformed hits, and explains errors', async () => {
    mockSearch.mockResolvedValueOnce(hits({ objectID: 'x' }));
    await render(<GameSearch />);
    await type('nothing');
    expect(screen.getByTestId('game-search-empty')).toBeTruthy();
    mockSearch.mockRejectedValueOnce(new Error('network'));
    await type('again');
    expect(screen.getByTestId('game-search-error')).toBeTruthy();
  });

  it('says when search is not set up yet', async () => {
    mockConfigured = false;
    await render(<GameSearch />);
    await type('elden');
    expect(screen.getByTestId('game-search-not-configured')).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
