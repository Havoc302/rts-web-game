// The Population suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/demographics.case.js',
  './cases/income-population.case.js',
  './cases/population-stabilization.case.js',
  './cases/job-attraction.case.js',
  './cases/happiness-demand.case.js',
]);
