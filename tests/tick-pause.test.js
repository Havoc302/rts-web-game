import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { BATTERY_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

function flatten(grid) {
  for (const row of grid.tiles) {
    for (const tile of row) tile.terrain = TERRAIN.FLAT;
  }
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const battery = grid.placeProducer(2, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
  grid.placeProducer(2, 3, PRODUCER_TYPE.WINDMILL, 40);
  grid.placeRoad(3, 2);
  battery.storedEnergy = 80;
  const windCapacity = grid.producers.find((p) => p.type === PRODUCER_TYPE.WINDMILL).capacity;

  const sim = new Simulation(grid);
  sim.resourceManager.stockpile.ironOre = 5;
  const oreBefore = sim.resourceManager.stockpile.ironOre;
  const tickBefore = sim.tickCount;
  const energyBefore = battery.storedEnergy;

  sim.tick(false);

  assert.strictEqual(sim.tickCount, tickBefore, 'Preview tick must not advance tickCount');
  assert.strictEqual(sim.resourceManager.stockpile.ironOre, oreBefore, 'Preview tick must not extract resources');
  assert.strictEqual(battery.storedEnergy, energyBefore, 'Preview tick must not change storedEnergy');
  assert.strictEqual(
    grid.producers.find((p) => p.type === PRODUCER_TYPE.WINDMILL).capacity,
    windCapacity,
    'Preview tick must not reroll wind capacity',
  );
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.placeRoad(1, 2);
  grid.placeZone(1, 1, ZONE.RESIDENTIAL);
  const tile = grid.getTile(1, 1);
  tile.population = 20;
  tile.maxPopulation = 25;
  const sim = new Simulation(grid);
  sim.resourceManager.stockpile.food = 0;
  sim.tick(false);
  assert.strictEqual(tile.populationLoss || 0, 0, 'Paused preview must not apply famine');
}

console.log('Tick pause / preview tests passed.');
