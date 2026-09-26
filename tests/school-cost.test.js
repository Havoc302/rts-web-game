import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(10, 10, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

const school = grid.placeProducer(3, 3, PRODUCER_TYPE.SCHOOL, 0);
for (let y = 2; y <= 4; y++) grid.placeRoad(2, y);

ServiceManager.updateServices(grid, 5000, 1);
assert.strictEqual(school.totalJobs, 27, '5,000 population should require 27 school staff (800 kids / 30)');
assert.strictEqual(school.filledJobs, 27, 'School jobs should be fully staffed from available workforce');
assert.strictEqual(school.runningCost, 79, 'School running cost at 5000 pop should be $79 (27 jobs * $2 * 1.45 utility factor)');

const fullCost = school.runningCost;
school.budget = 50;
ServiceManager.updateServices(grid, 5000, 1);
assert.ok(school.runningCost < fullCost, 'Lower school budget should reduce its running cost');
assert.strictEqual(school.totalJobs, 14, '50% budget should halve staffed school jobs (round(27 * 0.5) = 14)');

console.log('School operating cost tests passed.');