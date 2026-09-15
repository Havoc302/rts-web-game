import assert from 'assert';
import { COSTS, JOBS_PROVIDED, DENSITY, ZONE } from '../src/config.js';

assert.strictEqual(COSTS.INDUSTRIAL_ZONE, 300, 'Industrial zones should cost $300 to build');
assert.strictEqual(COSTS.AGRICULTURAL_ZONE, 300, 'Agricultural zones should cost $300 to build');
for (const density of Object.values(DENSITY)) {
  assert.strictEqual(
    JOBS_PROVIDED[ZONE.INDUSTRIAL][density],
    JOBS_PROVIDED[ZONE.COMMERCIAL][density],
    `Industrial and commercial job tables should match at ${density} density`,
  );
}

console.log('Industrial zoning economics tests passed.');