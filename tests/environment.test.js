// The Environment suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/river-pollution.case.js',
  './cases/river-fords.case.js',
  './cases/weather-manager.case.js',
  './cases/weather-overlay.case.js',
  './cases/temperature-load.case.js',
  './cases/crime-dynamics.case.js',
  './cases/fire-repair.case.js',
  './cases/fire-alert.case.js',
  './cases/waterfront.case.js',
]);
