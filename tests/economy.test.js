// The Economy suite shares one process so the runner spawns fewer Node processes. Each case is
// still its own module with its own scope, and a failure in one does not stop the rest.
import { runCases } from './harness.js';

await runCases(import.meta.url, [
  './cases/tax-revenue.case.js',
  './cases/tax-pressure.case.js',
  './cases/loan-manager.case.js',
  './cases/insolvency.case.js',
  './cases/consumer-goods.case.js',
  './cases/industrial-economics.case.js',
]);
