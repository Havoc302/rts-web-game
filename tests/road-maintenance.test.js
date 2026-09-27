import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { PRODUCER_TYPE, TERRAIN, UTILITY_OPERATING_COST } from '../src/config.js';

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

{
  const utilGrid = new Grid(8, 8, 1);
  for (const row of utilGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  utilGrid.getTile(0, 1).terrain = TERRAIN.WATER;
  utilGrid.getTile(0, 3).terrain = TERRAIN.WATER;
  const sim = new Simulation(utilGrid);
  utilGrid.placeProducer(1, 1, PRODUCER_TYPE.WATER_TOWER, 120);
  utilGrid.placeProducer(1, 3, PRODUCER_TYPE.SEWAGE_PLANT, 120);
  utilGrid.placeProducer(4, 4, PRODUCER_TYPE.BATTERY, 400);
  utilGrid.placeProducer(5, 4, PRODUCER_TYPE.WINDMILL, 40);
  utilGrid.placeProducer(6, 6, PRODUCER_TYPE.SCHOOL);
  sim.computeStats();
  assert.strictEqual(sim.stats.utilityExpenses, 4 * UTILITY_OPERATING_COST, 'Pump, sewage plant, battery, and generator each cost per tick; services do not');
}

console.log('Road maintenance tests passed.');
