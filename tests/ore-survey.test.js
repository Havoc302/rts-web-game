import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { PRODUCER_TYPE, TERRAIN, ORE_CONFIG } from '../src/config.js';

function clearTerrain(grid) {
  for (const row of grid.tiles) {
    for (const tile of row) tile.terrain = TERRAIN.FLAT;
  }
}

// Ore generation is weighted toward mountain terrain.
{
  const grid = new Grid(40, 40, 24680);
  let mountainTiles = 0;
  let mountainDeposits = 0;
  let flatTiles = 0;
  let flatDeposits = 0;
  for (const row of grid.tiles) {
    for (const tile of row) {
      if (tile.terrain === TERRAIN.MOUNTAIN) {
        mountainTiles++;
        if (tile.ore) mountainDeposits++;
      } else if (tile.terrain === TERRAIN.FLAT) {
        flatTiles++;
        if (tile.ore) flatDeposits++;
      }
    }
  }
  assert.ok(Object.keys(ORE_CONFIG).length === 4, 'Four simplified ore types should exist');
  assert.ok(mountainTiles > 0 && flatTiles > 0, 'Test map should contain mountain and flat terrain');
  assert.ok(mountainDeposits / mountainTiles > flatDeposits / flatTiles, 'Mountains should have a higher ore deposit rate');
}

// Survey stations need all utilities and survey one target at a time.
{
  const grid = new Grid(12, 12, 1);
  clearTerrain(grid);
  grid.tiles[3][0].terrain = TERRAIN.WATER;
  grid.tiles[5][0].terrain = TERRAIN.WATER;
  grid.tiles[4][4].terrain = TERRAIN.MOUNTAIN;
  const simulation = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
  grid.placeProducer(3, 3, PRODUCER_TYPE.SURVEY_STATION, 0);
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);
  grid.placeRoad(3, 3);

  simulation.tick();
  const station = grid.producers.find((producer) => producer.type === PRODUCER_TYPE.SURVEY_STATION);
  const powerPlant = grid.producers.find((producer) => producer.type === PRODUCER_TYPE.POWER_PLANT);
  assert.strictEqual(station.operational, true, 'Survey station should operate when all utilities are connected');
  assert.strictEqual(powerPlant.usedCapacity, 6, 'Idle survey station plus water/sewage baseline draws should use 6 power');
  assert.strictEqual(simulation.stats.powerDemand, 0, 'Idle survey should not add active power demand');
  assert.strictEqual(grid.startSurvey(3, 4), true, 'Survey station should accept one target');
  assert.strictEqual(grid.startSurvey(4, 4), false, 'A busy survey station should reject a second target');

  simulation.tick();
  assert.strictEqual(powerPlant.usedCapacity, 16, 'Active survey should add a ten-unit power demand on top of the 6-unit baseline');
  assert.strictEqual(simulation.stats.powerDemand, 10, 'Active survey power should appear in HUD demand');

  for (let i = 0; i < 8; i++) simulation.tick();
  assert.strictEqual(grid.getTile(3, 4).oreDiscovered, false, 'Standard survey should take ten ticks');
  simulation.tick();
  assert.strictEqual(grid.getTile(3, 4).oreDiscovered, true, 'Standard survey should complete after ten ticks');

  assert.strictEqual(grid.startSurvey(4, 4), true, 'Station should accept another target after completion');
  for (let i = 0; i < 19; i++) simulation.tick();
  assert.strictEqual(grid.getTile(4, 4).oreDiscovered, false, 'Mountain survey should take twenty ticks');
  simulation.tick();
  assert.strictEqual(grid.getTile(4, 4).oreDiscovered, true, 'Mountain survey should complete after twenty ticks');
}

console.log('Ore and survey tests passed.');
