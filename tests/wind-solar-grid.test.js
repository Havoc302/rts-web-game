import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { BATTERY_CONFIG, PRODUCER_TYPE, TERRAIN } from '../src/config.js';

function flatten(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  const windmill = grid.placeProducer(2, 2, PRODUCER_TYPE.WINDMILL, 40);
  grid.placeRoad(3, 3);
  UtilityManager.allocateAll(grid);
  assert.strictEqual(UtilityManager.contributesPowerToGrid(grid, windmill), true, 'Mill counts when its battery is road-adjacent');
  assert.ok(battery.storedEnergy > 0, 'Road-connected battery still receives mill surplus');

  const sim = new Simulation(grid);
  sim.computeStats();
  assert.ok(sim.stats.powerCapacity > 0, 'HUD powerCapacity must include a mill whose battery is on the road');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  const windmill = grid.placeProducer(2, 2, PRODUCER_TYPE.WINDMILL, 40);
  UtilityManager.allocateAll(grid);
  assert.strictEqual(UtilityManager.contributesPowerToGrid(grid, windmill), false, 'Mill does not count if the battery is off-road');
  assert.strictEqual(battery.storedEnergy, 0, 'Off-road battery must not be charged from mill surplus');
  const sim = new Simulation(grid);
  sim.computeStats();
  assert.strictEqual(sim.stats.powerCapacity, 0, 'HUD must not count an off-grid mill');
}

console.log('Wind/solar grid connectivity tests passed.');
