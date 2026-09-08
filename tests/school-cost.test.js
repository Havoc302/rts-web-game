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
assert.ok(school.runningCost > 0, 'An operating school should have a running cost');
assert.ok(school.runningCost < 500, 'School cost should remain tied to staffed jobs, not total population');

const fullCost = school.runningCost;
school.budget = 50;
ServiceManager.updateServices(grid, 5000, 1);
assert.ok(school.runningCost < fullCost, 'Lower school budget should reduce its running cost');

console.log('School operating cost tests passed.');