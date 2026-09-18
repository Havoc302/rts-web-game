import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { BATTERY_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

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
  assert.ok(sim.stats.powerCapacity > 0, 'HUD powerCapacity should include connected renewable generation');
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

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.getTile(0, 1).terrain = TERRAIN.WATER;
  grid.getTile(0, 3).terrain = TERRAIN.WATER;
  grid.placeProducer(1, 1, PRODUCER_TYPE.WATER_TOWER, 120);
  grid.placeProducer(1, 3, PRODUCER_TYPE.SEWAGE_PLANT, 120);
  const battery = grid.placeProducer(4, 3, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  const windmill = grid.placeProducer(3, 3, PRODUCER_TYPE.WINDMILL, 40);
  for (const [x, y] of [[2, 1], [2, 2], [2, 3], [2, 4], [3, 4], [4, 4]]) grid.placeRoad(x, y);
  UtilityManager.allocateAll(grid);

  assert.ok(battery.storedEnergy > 0, 'Connected windmill should charge its adjacent battery before grid allocation');
  assert.strictEqual(windmill.utilityShortfall.water, false, 'Windmills should not consume water directly');
  assert.strictEqual(windmill.utilityShortfall.sewage, false, 'Windmills should not consume sewage capacity directly');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.getTile(0, 1).terrain = TERRAIN.WATER;
  grid.getTile(0, 2).terrain = TERRAIN.WATER;
  grid.placeProducer(1, 1, PRODUCER_TYPE.WATER_TOWER, 120);
  grid.placeProducer(1, 2, PRODUCER_TYPE.SEWAGE_PLANT, 120);
  grid.placeProducer(5, 6, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  const solarPanel = grid.placeProducer(6, 6, PRODUCER_TYPE.SOLAR_PANEL, 60);
  UtilityManager.allocateAll(grid);

  assert.strictEqual(solarPanel.utilityShortfall.water, false, 'Solar panels should not consume water directly');
  assert.strictEqual(solarPanel.utilityShortfall.sewage, false, 'Solar panels should not consume sewage capacity directly');
  assert.strictEqual(UtilityManager.contributesPowerToGrid(grid, solarPanel), false, 'Solar panels require a road-connected battery');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  grid.placeProducer(2, 2, PRODUCER_TYPE.SOLAR_PANEL, 60);
  grid.placeRoad(3, 3);
  grid.placeZone(4, 3, ZONE.RESIDENTIAL);
  const home = grid.getTile(4, 3);
  home.population = 25;
  home.maxPopulation = 25;
  battery.storedEnergy = 40;

  UtilityManager.allocateAll(grid, 12);
  assert.strictEqual(home.shortfall.power, false, 'Live solar generation should serve demand before battery discharge');
  assert.ok(battery.storedEnergy > 40, 'Only unused solar generation should charge the battery');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  grid.placeProducer(2, 2, PRODUCER_TYPE.SOLAR_PANEL, 60);
  grid.placeRoad(3, 3);
  grid.placeZone(4, 3, ZONE.RESIDENTIAL);
  const home = grid.getTile(4, 3);
  home.population = 25;
  home.maxPopulation = 25;
  battery.storedEnergy = 40;

  UtilityManager.allocateAll(grid, 0);
  assert.strictEqual(home.shortfall.power, false, 'Stored energy should cover demand when renewable generation is unavailable');
  assert.strictEqual(battery.storedEnergy, 39, 'Battery should discharge only during a renewable deficit');
}

{
  const grid = new Grid(12, 12, 1);
  flatten(grid);
  const battery = grid.placeProducer(4, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  grid.placeProducer(3, 2, PRODUCER_TYPE.WINDMILL, 40);
  grid.placeProducer(5, 2, PRODUCER_TYPE.WINDMILL, 40);
  grid.placeProducer(4, 1, PRODUCER_TYPE.WINDMILL, 40);
  grid.placeRoad(4, 3);
  grid.placeZone(5, 3, ZONE.RESIDENTIAL);
  const home = grid.getTile(5, 3);
  home.population = 25;
  home.maxPopulation = 25;
  const previousRandom = Math.random;
  Math.random = () => 0.5;
  try {
    UtilityManager.allocateAll(grid, 12);
  } finally {
    Math.random = previousRandom;
  }

  assert.strictEqual(home.shortfall.power, false, 'All windmills connected through a battery should pass live power to the grid');
  assert.strictEqual(battery.usedCapacity, 0, 'Battery discharge cap should not limit renewable pass-through');
  assert.strictEqual(battery.storedEnergy, 119, 'Only unused combined wind generation should charge the battery');
}

console.log('Wind/solar grid connectivity tests passed.');
