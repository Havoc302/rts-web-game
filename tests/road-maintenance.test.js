import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { TERRAIN } from '../src/config.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

grid.tiles[3][3].terrain = TERRAIN.WATER;
const simulation = new Simulation(grid);
simulation.computeStats();
assert.strictEqual(simulation.stats.roadExpenses, 0, 'A city with no roads should have no road maintenance cost');

grid.placeRoad(1, 1);
grid.placeRoad(1, 2);
grid.placeBridge(3, 3);
simulation.computeStats();
assert.strictEqual(simulation.stats.roadExpenses, 30, 'Each road and bridge tile should cost ten per tick after scaling');

console.log('Road maintenance tests passed.');
