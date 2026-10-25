import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  DEFAULT_DENSITY,
  gridLayout,
  nextDensity,
  useGridDensity,
} from '@/features/listings/grid/density';
import { DensityToggle, ListingGrid } from '@/features/listings/grid/ListingGrid';
import { ListingTile, type ListingTileData } from '@/features/listings/grid/ListingTile';

// The pinch gesture needs the native gesture runtime; its rule (nextDensity) is tested on its own.
jest.mock('react-native-gesture-handler', () => {
  const chain = { runOnJS: () => chain, onEnd: () => chain };
  return {
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: { Pinch: () => chain },
  };
});

const ITEM: ListingTileData = {
  id: 'l1',
  igdbGameId: 119133,
  gameTitle: 'Elden Ring',
  platform: 'ps5',
  coverImageId: 'co4jni',
  hasPhotos: true,
  condition: 'like_new',
  isForTrade: true,
  isForSale: true,
  askingPriceAgorot: 15000,
  areaName: 'Haifa',
  distanceKm: 3.4,
};

beforeEach(() => {
  useGridDensity.setState({ density: DEFAULT_DENSITY, anchors: {} });
});

describe('density', () => {
  it('defaults to 2 per row', () => {
    expect(DEFAULT_DENSITY).toBe(2);
  });

  it('moves one step per pinch: out = fewer per row, in = more, small pinches ignored', () => {
    expect(nextDensity(2, 1.5)).toBe(1);
    expect(nextDensity(1, 2)).toBe(1);
    expect(nextDensity(2, 0.6)).toBe(3);
    expect(nextDensity(3, 0.2)).toBe(3);
    expect(nextDensity(2, 1.05)).toBe(2);
  });

  it('computes fixed tile and row sizes per density', () => {
    const two = gridLayout(358, 2, 12);
    expect(two.tileWidth).toBe(173);
    expect(two.rowHeight).toBeCloseTo((173 * 4) / 3 + 72 + 12);
    const three = gridLayout(358, 3, 12);
    expect(three.tileHeight).toBeCloseTo((three.tileWidth * 4) / 3);
    expect(gridLayout(358, 1, 12).tileHeight).toBe(136);
  });
});

describe('ListingTile', () => {
  it.each([1, 2, 3] as const)(
    'reads title, platform, condition, offer, photos and distance at density %i',
    async (density) => {
      await render(<ListingTile item={ITEM} density={density} width={170} />);
      expect(screen.getByTestId('listing-tile-l1').props.accessibilityLabel).toBe(
        'Elden Ring, PS5, Like new, Trade · ₪150, Real photos, Haifa, ~3 km',
      );
    },
  );

  it('shows the title as text at 1 and 2 per row, and only the cover at 3', async () => {
    const { rerender } = await render(<ListingTile item={ITEM} density={2} width={170} />);
    expect(screen.getByText('Elden Ring')).toBeTruthy();
    await rerender(<ListingTile item={ITEM} density={3} width={110} />);
    expect(screen.queryByText('Elden Ring')).toBeNull();
    expect(screen.getByText('Trade · ₪150')).toBeTruthy();
  });

  it('reports a tap', async () => {
    const onPress = jest.fn();
    await render(<ListingTile item={ITEM} density={2} width={170} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('listing-tile-l1'));
    expect(onPress).toHaveBeenCalledWith(ITEM);
  });
});

describe('DensityToggle and ListingGrid', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ ...ITEM, id: `l${i}` }));

  it('switches density from the toggle, and the grid follows', async () => {
    await render(
      <>
        <DensityToggle />
        <ListingGrid items={items} />
      </>,
    );
    expect(screen.getByTestId('density-2').props.accessibilityState).toMatchObject({
      checked: true,
    });
    await fireEvent.press(screen.getByTestId('density-3'));
    expect(useGridDensity.getState().density).toBe(3);
    expect(screen.getByTestId('density-3').props.accessibilityState).toMatchObject({
      checked: true,
    });
    // Cover-only tiles: the offer is shown, the title is only read by screen readers.
    expect(screen.queryAllByText(/^Elden Ring/)).toHaveLength(0);
    expect(screen.getAllByText('Trade · ₪150').length).toBeGreaterThan(0);
  });

  it('remembers only the density, not the scroll anchor', () => {
    const persist = (
      useGridDensity as unknown as {
        persist: { getOptions: () => { partialize: (s: object) => object } };
      }
    ).persist;
    expect(
      persist.getOptions().partialize({ density: 3, anchors: { a: 40 }, setDensity: jest.fn() }),
    ).toEqual({
      density: 3,
    });
  });

  it('reopens near the same item after a density change', async () => {
    await render(
      <>
        <DensityToggle />
        <ListingGrid items={items} />
      </>,
    );
    // Scrolled so item 7 is the first visible one (row 3 at 2 per row).
    await act(() =>
      screen
        .getByTestId('listing-grid')
        .props.onViewableItemsChanged({ viewableItems: [{ index: 7 }] }),
    );
    await fireEvent.press(screen.getByTestId('density-3'));
    expect(screen.getByTestId('listing-grid').props.initialScrollIndex).toBe(2);
  });

  it("does not start a new grid at another grid's position, and forgets a closed grid", async () => {
    useGridDensity.setState({ anchors: { other: 9 } });
    const { unmount } = await render(<ListingGrid items={items} />);
    expect(screen.getByTestId('listing-grid').props.initialScrollIndex).toBe(0);
    await act(() =>
      screen
        .getByTestId('listing-grid')
        .props.onViewableItemsChanged({ viewableItems: [{ index: 4 }] }),
    );
    expect(Object.keys(useGridDensity.getState().anchors)).toHaveLength(2);
    await unmount();
    expect(useGridDensity.getState().anchors).toEqual({ other: 9 });
  });
});
