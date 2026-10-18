import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.join(__dirname, '..', '..');

/** Starts a rules test environment against the running emulators (host/port come from `emulators:exec`). */
export function createTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-weloot',
    firestore: { rules: readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(path.join(repoRoot, 'storage.rules'), 'utf8') },
  });
}
