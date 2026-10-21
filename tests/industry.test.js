// The Industry suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/industrial-inputs.case.js',
  './cases/fuel-refinery.case.js',
  './cases/sand-industry.case.js',
  './cases/resource-management.case.js',
  './cases/ore-survey.case.js',
  './cases/uranium.case.js',
]);
