/** Scroll distance (px) downward before the tab bar hides (PRD §3.4). */
export const HIDE_THRESHOLD = 10;

export type ScrollTrackerState = {
  /** Last observed offset. */
  lastY: number;
  /** Offset where the user last scrolled up or the bar last appeared; hiding is measured from here. */
  anchorY: number;
  hidden: boolean;
};

export const INITIAL_SCROLL_STATE: ScrollTrackerState = { lastY: 0, anchorY: 0, hidden: false };

export type ScrollSample = {
  /** contentOffset.y */
  y: number;
  /** contentSize.height */
  contentHeight: number;
  /** layoutMeasurement.height */
  viewportHeight: number;
};

/**
 * Decides whether the tab bar is hidden after a scroll event (PRD §3.4):
 * - always visible when the content fits on screen or the list is at the top;
 * - hides after scrolling down more than HIDE_THRESHOLD px from where the user last scrolled up;
 * - any upward scroll shows it again immediately;
 * - bounce/overscroll past either end is ignored so it can't flicker the bar.
 * Pure and worklet-safe, so it runs on the UI thread and in unit tests.
 */
export function nextScrollState(
  state: ScrollTrackerState,
  sample: ScrollSample,
): ScrollTrackerState {
  'worklet';
  const maxY = sample.contentHeight - sample.viewportHeight;
  if (maxY <= 0 || sample.y <= 0) {
    return { lastY: Math.max(sample.y, 0), anchorY: 0, hidden: false };
  }
  if (sample.y > maxY) {
    // Overscroll at the bottom (iOS bounce): keep the current state.
    return { ...state, lastY: maxY };
  }

  const dy = sample.y - state.lastY;
  if (dy < 0) {
    return { lastY: sample.y, anchorY: sample.y, hidden: false };
  }
  if (!state.hidden && sample.y - state.anchorY > HIDE_THRESHOLD) {
    return { lastY: sample.y, anchorY: state.anchorY, hidden: true };
  }
  return { ...state, lastY: sample.y };
}
