import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(10, 10, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

const police = grid.placeProducer(3, 3, PRODUCER_TYPE.POLICE_STATION, 0);
grid.placeRoad(2, 3);
ServiceManager.updateServices(grid, 0, 1);

assert.ok(police.runningCost > 0, 'A staffed police station should have a running cost');
assert.ok(police.runningCost < 20, 'Tiny-city service cost should not be based on total population');

console.log('Service expense scaling tests passed.');