import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { PollutionManager } from '../src/engine/PollutionManager.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(12, 12, 1);
for (const row of grid.tiles) {
  for (const tile of row) {
    tile.terrain = TERRAIN.FLAT;
    tile.riverFlowDir = null;
  }
}

for (let y = 1; y <= 9; y++) {
  const tile = grid.getTile(5, y);
  tile.terrain = TERRAIN.WATER;
  tile.riverFlowDir = { x: 0, y: 1 };
}

const sewagePlant = grid.placeProducer(4, 2, PRODUCER_TYPE.SEWAGE_PLANT, 35);
PollutionManager.computeWaterPollution(grid);

assert.strictEqual(grid.getTile(5, 2).riverPollution, 0, 'Idle sewage plants should not pollute the river');

sewagePlant.usedCapacity = 35;
PollutionManager.computeWaterPollution(grid);

assert.strictEqual(grid.getTile(5, 2).riverPollution, 35, 'Discharge should begin at full strength');
assert.strictEqual(grid.getTile(5, 3).riverPollution, 25, 'River pollution should fall off by ten per tile');
assert.strictEqual(grid.getTile(5, 5).riverPollution, 5, 'River pollution should continue falling downstream');
assert.strictEqual(grid.getTile(5, 6).riverPollution, 0, 'River pollution should stop when strength reaches zero');

const combinedGrid = new Grid(12, 12, 1);
for (const row of combinedGrid.tiles) {
  for (const tile of row) {
    tile.terrain = TERRAIN.FLAT;
    tile.riverFlowDir = null;
  }
}
for (let y = 1; y <= 5; y++) {
  const tile = combinedGrid.getTile(5, y);
  tile.terrain = TERRAIN.WATER;
  tile.riverFlowDir = { x: 0, y: 1 };
}
const firstPlant = combinedGrid.placeProducer(4, 2, PRODUCER_TYPE.SEWAGE_PLANT, 35);
const secondPlant = combinedGrid.placeProducer(6, 2, PRODUCER_TYPE.SEWAGE_PLANT, 35);
firstPlant.usedCapacity = 35;
secondPlant.usedCapacity = 35;
PollutionManager.computeWaterPollution(combinedGrid);

assert.strictEqual(combinedGrid.getTile(5, 2).riverPollution, 70, 'Adjacent sewage discharges should combine at the entry tile');
assert.strictEqual(combinedGrid.getTile(5, 3).riverPollution, 60, 'Combined river pollution should retain the ten-per-tile falloff');

console.log('River pollution range and falloff tests passed.');
