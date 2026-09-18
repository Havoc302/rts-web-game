import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { FireManager } from '../src/engine/FireManager.js';
import { FIRE_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

{
  const emptyZone = { zone: ZONE.RESIDENTIAL, population: 0, maxPopulation: 25, terrain: TERRAIN.FLAT };
  assert.strictEqual(FireManager.isFlammable(emptyZone), false, 'Unoccupied zones have nothing to burn');
  assert.strictEqual(FireManager.isFlammable({ terrain: TERRAIN.FLAT, zone: ZONE.NONE, hasRoad: true }), false, 'Roads do not burn');
  assert.strictEqual(FireManager.isFlammable({ terrain: TERRAIN.FOREST, zone: ZONE.NONE }), true, 'Forests can burn');
  assert.strictEqual(FireManager.isFlammable({ terrain: TERRAIN.MOUNTAIN, zone: ZONE.NONE }), false, 'Mountains are fire-immune');
  assert.strictEqual(
    FireManager.isFlammable({ zone: ZONE.RESIDENTIAL, population: 10, maxPopulation: 25, terrain: TERRAIN.FLAT }),
    true,
    'Occupied homes can burn',
  );
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const forest = grid.getTile(3, 3);
  forest.terrain = TERRAIN.FOREST;
  forest.onFire = true;
  grid.rebuildActiveTileSets();

  const stats = { fireInjuries: 0, displacedPopulation: 0 };
  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    FireManager.updateFires(grid, stats);
    assert.strictEqual(stats.fireInjuries, 1, 'A wildfire injury should contribute one patient');
    assert.strictEqual(forest.forestFireInjury, true, 'Wildfire injury chance should resolve once per fire');
    stats.fireInjuries = 0;
    FireManager.updateFires(grid, stats);
    assert.strictEqual(stats.fireInjuries, 1, 'A wildfire should not create additional injuries on later ticks');
  } finally {
    Math.random = previousRandom;
  }
}

{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  const fire = grid.placeProducer(3, 3, PRODUCER_TYPE.FIRE_STATION, 0);
  for (let y = 1; y <= 4; y++) grid.placeRoad(2, y);
  fire.operational = true;
  fire.totalJobs = 10;
  fire.filledJobs = 10;
  fire.effectiveRadius = 40;

  const tile = grid.getTile(3, 4);
  tile.zone = ZONE.RESIDENTIAL;
  tile.population = 20;
  tile.maxPopulation = 25;
  tile.onFire = true;
  tile.fireDamage = 40;
  tile.fireRepair = 1;

  FireManager.updateFires(grid, { fireInjuries: 0, displacedPopulation: 0 });
  assert.strictEqual(tile.onFire, false, 'Covered fire should be extinguished');
  assert.strictEqual(tile.fireRepair, 0, 'A fire that actually burned should start repair at zero tax/use');

  FireManager.updateFires(grid, { fireInjuries: 0, displacedPopulation: 0 });
  assert.ok(tile.fireRepair > 0, 'Repair progress should increase each tick after the fire is out');
  assert.ok(tile.fireRepair <= FIRE_CONFIG.REPAIR_PER_TICK + 0.0001, 'Repair should be gradual');
}

console.log('Fire flammability and repair tests passed.');
