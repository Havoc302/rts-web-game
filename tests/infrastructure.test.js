// The Infrastructure suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/wind-solar-grid.case.js',
  './cases/placement-rules.case.js',
  './cases/road-maintenance.case.js',
  './cases/traffic-manager.case.js',
  './cases/active-tile-registry.case.js',
  './cases/tick-pause.case.js',
]);
