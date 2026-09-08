import assert from 'assert';
import { BASE_INCOME, COSTS, DENSITY, ZONE } from '../src/config.js';

assert.strictEqual(COSTS.INDUSTRIAL_ZONE, 30, 'Industrial zones should cost $30 to build');
for (const density of Object.values(DENSITY)) {
  assert.ok(
    BASE_INCOME[ZONE.INDUSTRIAL][density] > BASE_INCOME[ZONE.COMMERCIAL][density],
    `Industrial income should exceed commercial income at ${density} density`,
  );
}

console.log('Industrial zoning economics tests passed.');