import {
  HIDE_THRESHOLD,
  INITIAL_SCROLL_STATE,
  nextScrollState,
  type ScrollTrackerState,
} from '@/navigation/hideOnScroll';

const LONG = { contentHeight: 3000, viewportHeight: 800 }; // maxY = 2200
const SHORT = { contentHeight: 600, viewportHeight: 800 };

/** Feeds a sequence of offsets through the state machine and returns the final state. */
function scrollThrough(
  ys: number[],
  page = LONG,
  start: ScrollTrackerState = INITIAL_SCROLL_STATE,
) {
  return ys.reduce((state, y) => nextScrollState(state, { y, ...page }), start);
}

describe('nextScrollState (PRD §3.4)', () => {
  it('stays visible within the threshold', () => {
    expect(scrollThrough([4, 8, HIDE_THRESHOLD]).hidden).toBe(false);
  });

  it('hides after scrolling down past the threshold', () => {
    expect(scrollThrough([5, 11]).hidden).toBe(true);
  });

  it('hides on many small downward steps (not just one big jump)', () => {
    expect(scrollThrough([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).hidden).toBe(true);
  });

  it('reappears on any upward scroll', () => {
    const hidden = scrollThrough([100, 400]);
    expect(hidden.hidden).toBe(true);
    expect(nextScrollState(hidden, { y: 399, ...LONG }).hidden).toBe(false);
  });

  it('measures the next hide from where the user scrolled up', () => {
    const shown = scrollThrough([100, 400, 390]); // up at 390
    expect(shown.hidden).toBe(false);
    expect(nextScrollState(shown, { y: 398, ...LONG }).hidden).toBe(false); // +8
    expect(nextScrollState(shown, { y: 401, ...LONG }).hidden).toBe(true); // +11
  });

  it('always shows for content shorter than the screen', () => {
    const hidden = scrollThrough([100, 400]);
    expect(nextScrollState(hidden, { y: 50, ...SHORT }).hidden).toBe(false);
  });

  it('shows at the top and on top overscroll (negative offset)', () => {
    const hidden = scrollThrough([100, 400]);
    expect(nextScrollState(hidden, { y: 0, ...LONG }).hidden).toBe(false);
    expect(nextScrollState(hidden, { y: -30, ...LONG }).hidden).toBe(false);
  });

  it('ignores bottom bounce so the bar does not flicker', () => {
    const hidden = scrollThrough([100, 2200]);
    expect(hidden.hidden).toBe(true);
    const bounced = scrollThrough([2260, 2230, 2200], LONG, hidden);
    expect(bounced.hidden).toBe(true);
  });
});
