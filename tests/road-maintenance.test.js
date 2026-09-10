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
assert.strictEqual(simulation.stats.roadExpenses, 3, 'Each road and bridge tile should cost one per tick');

grid.tiles[4][4].terrain = TERRAIN.MOUNTAIN;
assert.strictEqual(grid.canPlaceTunnel(4, 4), true, 'Tunnels should be placeable on mountain tiles');
assert.strictEqual(grid.placeTunnel(4, 4), true, 'Tunnel placement should succeed on mountain tiles');
assert.strictEqual(grid.getTile(4, 4).hasRoad, true, 'Tunnels should participate in the road network');
assert.strictEqual(grid.bulldoze(4, 4), true, 'Tunnels should be removable by bulldozing');
assert.strictEqual(grid.getTile(4, 4).hasTunnel, false, 'Bulldozing should clear the tunnel');

console.log('Road maintenance tests passed.');
