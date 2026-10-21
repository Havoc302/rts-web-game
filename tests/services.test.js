// The Services suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/service-buildings.case.js',
  './cases/service-tiers.case.js',
  './cases/service-expense-scale.case.js',
  './cases/staffing-ownership.case.js',
  './cases/coverage.case.js',
  './cases/water-sewage-tiers.case.js',
  './cases/school-cost.case.js',
  './cases/education.case.js',
]);
