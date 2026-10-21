// The UI suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/hud-update.case.js',
  './cases/inspector-status.case.js',
  './cases/zone-upgrades.case.js',
  './cases/tutorial.case.js',
  './cases/audio-manager.case.js',
  './cases/renderer-cache.case.js',
  './cases/version-sync.case.js',
]);
