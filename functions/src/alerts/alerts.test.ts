import { DEFAULT_ALERT_LIMITS, decidePush, israelDay, type AlertState } from './alerts';

jest.mock('firebase-functions', () => ({ logger: { warn: jest.fn() } }));

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe('israelDay', () => {
  it('uses Israel time, so the day turns at local midnight', () => {
    // 22:30 UTC on Oct 25 is already Oct 26 in Israel (UTC+2/+3).
    expect(israelDay(at('2026-10-25T22:30:00Z'))).toBe('2026-10-26');
    expect(israelDay(at('2026-10-25T20:00:00Z'))).toBe('2026-10-25');
  });
});

describe('decidePush', () => {
  const now = at('2026-10-25T12:00:00Z');

  it('pushes the first time and records it', () => {
    const { push, state } = decidePush(undefined, 'a_1', now, DEFAULT_ALERT_LIMITS);
    expect(push).toBe(true);
    expect(state).toEqual({ day: '2026-10-25', pushes: 1, last: { a_1: now.getTime() } });
  });

  it('pushes the same alert at most once per 6 hours', () => {
    const first = decidePush(undefined, 'a_1', now, DEFAULT_ALERT_LIMITS).state;
    const soon = new Date(now.getTime() + 5 * HOUR);
    expect(decidePush(first, 'a_1', soon, DEFAULT_ALERT_LIMITS).push).toBe(false);
    // Another alert isn't held back.
    expect(decidePush(first, 'w_2', soon, DEFAULT_ALERT_LIMITS).push).toBe(true);
    const later = new Date(now.getTime() + 6 * HOUR);
    expect(decidePush(first, 'a_1', later, DEFAULT_ALERT_LIMITS).push).toBe(true);
  });

  it('pushes at most 5 a day per user, and starts over the next day', () => {
    let state: AlertState | undefined;
    const pushes: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      const decision = decidePush(state, `a_${i}`, now, DEFAULT_ALERT_LIMITS);
      pushes.push(decision.push);
      state = decision.state;
    }
    expect(pushes).toEqual([true, true, true, true, true, false, false]);
    const tomorrow = at('2026-10-26T08:00:00Z');
    const next = decidePush(state, 'a_9', tomorrow, DEFAULT_ALERT_LIMITS);
    expect(next.push).toBe(true);
    expect(next.state.pushes).toBe(1);
    // Cool-downs carry over midnight.
    expect(decidePush(state, 'a_4', at('2026-10-25T21:30:00Z'), DEFAULT_ALERT_LIMITS).push).toBe(
      false,
    );
  });

  it('follows the limits from config', () => {
    expect(
      decidePush(undefined, 'a_1', now, { alertPushesPerDay: 0, alertCooldownHours: 6 }).push,
    ).toBe(false);
  });
});
