import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every callable must take the App Check option (#38), so turning ENFORCE_APP_CHECK on covers all of them.
describe('App Check on callables', () => {
  it('passes the App Check option to every onCall', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    const calls = source.match(/onCall\([^,]*/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    // Prettier may put the options on their own line.
    const missing = calls.filter((call) => !/^onCall\(\s*(appCheck|\{ \.\.\.appCheck)/.test(call));
    expect(missing).toEqual([]);
  });
});
