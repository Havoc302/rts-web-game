import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, GROWTH_CONFIG, POPULATION_STABILIZATION_CONFIG, TERRAIN, ZONE } from '../src/config.js';

console.log('=== population-stabilization.test.js ===');

// 1. Config assertions
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.POPULATION_THRESHOLD, 1000, 'Shift threshold is 1,000 population');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.LOW_POPULATION_MAX_SHIFT, 20, 'Below 1,000 pop, shift cap is 20');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.HIGH_POPULATION_MAX_SHIFT_PERCENT, 0.02, 'Above 1,000 pop, shift cap is 2%');

// 2. processPopulationTick unit tests
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);
  sim.stats.maxPopulationCapacity = 5000;

  // Zero delta
  sim.stats.population = 1000;
  assert.strictEqual(sim.processPopulationTick(0), 0, 'Zero delta returns 0');
  assert.strictEqual(sim.stats.population, 1000, 'Zero delta does not change population');

  // Outflow at 1,000 pop clamps to 20: -3000 at 1000 pop clamps to -20.
  const clampedDrop = sim.processPopulationTick(-3000);
  assert.strictEqual(clampedDrop, -20, 'Transient -3,000 drop at 1,000 pop clamps to 20');
  assert.strictEqual(sim.stats.population, 980, 'Population drops to 980');

  // Growth below 1,000 pop clamps to 20.
  const clampedSurge = sim.processPopulationTick(500);
  assert.strictEqual(clampedSurge, 20, 'Surge at 980 population clamps to 20');
  assert.strictEqual(sim.stats.population, 1000, 'Population increases by 20 to 1,000');

  // Small delta within limits is uninhibited
  sim.stats.population = 1000;
  const smallDelta = sim.processPopulationTick(5);
  assert.strictEqual(smallDelta, 5, 'Delta within max shift is applied directly');
  assert.strictEqual(sim.stats.population, 1005, 'Population increases by exact small delta');

  // Growth below 1,000 pop uses 20 cap.
  sim.stats.population = 0;
  const earlyGrowth = sim.processPopulationTick(100);
  assert.strictEqual(earlyGrowth, 20, 'Zero population clamps to 20');
  assert.strictEqual(sim.stats.population, 20, 'Population increases by 20');
  assert.strictEqual(sim.getMaxPopulationGrowth(0), 20, 'Growth cap is 20 at 0 population');
  assert.strictEqual(sim.getMaxPopulationGrowth(500), 20, 'Growth cap is 20 at 500 population');
  assert.strictEqual(sim.getMaxPopulationGrowth(999), 20, 'Growth cap is 20 at 999 population');
  assert.strictEqual(sim.getMaxPopulationGrowth(1000), 20, 'Growth cap is 20 at 1,000 population (2%)');
  assert.strictEqual(sim.getMaxPopulationGrowth(2000), 40, 'Growth cap is 40 at 2,000 population (2%)');
  assert.strictEqual(sim.getMaxPopulationGrowth(5000), 100, 'Growth cap is 100 at 5,000 population (2%)');

  assert.strictEqual(sim.getMaxPopulationOutflow(0), 20, 'Outflow cap is 20 at 0 population');
  assert.strictEqual(sim.getMaxPopulationOutflow(500), 20, 'Outflow cap is 20 at 500 population');
  assert.strictEqual(sim.getMaxPopulationOutflow(1000), 20, 'Outflow cap is 20 at 1,000 population (2%)');
  assert.strictEqual(sim.getMaxPopulationOutflow(2000), 40, 'Outflow cap is 40 at 2,000 population (2%)');
  assert.strictEqual(sim.getMaxPopulationOutflow(5000), 100, 'Outflow cap is 100 at 5,000 population (2%)');

  // Population never drops below 0
  sim.stats.population = 0;
  const negativeDrop = sim.processPopulationTick(-10);
  assert.strictEqual(negativeDrop, -10, 'Outflow allows negative delta');
  assert.strictEqual(sim.stats.population, 0, 'Population clamped at 0 lower bound');
}

{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let index = 0; index < 40; index++) {
    const tile = grid.getTile(index % 10, Math.floor(index / 10));
    tile.zone = ZONE.RESIDENTIAL;
    tile.density = DENSITY.LIGHT;
    tile.population = 25;
    tile.growthScore = 0;
    grid.activeZonedTiles.add(tile);
  }
  const sim = new Simulation(grid);
  sim.stats.population = 1000;
  sim.stats.maxPopulationCapacity = 1000;
  sim.applyPopulationChange(1000);
  assert.strictEqual(Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0), 980, 'Tick-based outflow at 1,000 pop clamps to 20 departure ceiling');
}

// Growth ceilings do not create demand when residential growth metrics target zero.
{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let index = 0; index < 40; index++) {
    const tile = grid.getTile(index % 10, Math.floor(index / 10));
    tile.zone = ZONE.RESIDENTIAL;
    tile.density = DENSITY.LIGHT;
    tile.growthScore = 0;
    grid.activeZonedTiles.add(tile);
  }
  const sim = new Simulation(grid);
  sim.stats.maxPopulationCapacity = 1000;
  sim.applyPopulationChange(0);
  assert.strictEqual(Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0), 0, 'A zero growth-score target should attract no residents');

  for (const tile of grid.activeZonedTiles) tile.growthScore = 1;
  sim.applyPopulationChange(0);
  assert.strictEqual(Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0), 20, 'A supported demand above the cap can use the full 20-person ceiling');
}

// 3. Sustained crisis compound drain (at <= 1000 pop, 20 departures per tick)
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);
  sim.stats.population = 1000;

  for (let i = 0; i < 20; i++) {
    sim.processPopulationTick(-500); // Continuous crisis
  }

  // 1000 with 20 departures per tick over 20 ticks reaches 600.
  assert.strictEqual(sim.stats.population, 600, '20 ticks of sustained crisis yields 600 population');
}

console.log('Population stabilization tests passed.');

{
  const grid = new Grid(12, 12, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let index = 0; index < 20; index++) {
    const tile = grid.getTile(index % 10, Math.floor(index / 10));
    tile.zone = ZONE.RESIDENTIAL;
    tile.density = DENSITY.HIGH;
    tile.population = 250;
    tile.growthScore = GROWTH_CONFIG.MAX_SCORE;
    grid.activeZonedTiles.add(tile);
  }
  const sim = new Simulation(grid);
  sim.stats.population = 5000;
  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    sim.tick();
  } finally {
    Math.random = previousRandom;
  }
  assert.ok(sim.stats.population <= 5000 + sim.getMaxPopulationGrowth(5000), `One tick must respect the growth cap (got ${sim.stats.population})`);
  assert.strictEqual(sim.stats.population, Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0), 'HUD and residential tile totals must agree');
  const afterGrowth = sim.stats.population;
  for (const tile of grid.activeZonedTiles) tile.growthScore = 0;
  sim.tick(false);
  assert.strictEqual(sim.stats.population, afterGrowth, 'Paused preview must not move residents toward their growth-score targets');
  sim.tick();
  assert.ok(sim.stats.population >= afterGrowth - Math.floor(afterGrowth * POPULATION_STABILIZATION_CONFIG.HIGH_POPULATION_MAX_SHIFT_PERCENT), 'One tick must not drive city outflow faster than 2%');
  assert.strictEqual(sim.stats.population, Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0));
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  grid.placeRoad(2, 1);
  grid.placeRoad(5, 4);
  grid.placeZone(2, 2, ZONE.RESIDENTIAL);
  grid.placeZone(5, 5, ZONE.RESIDENTIAL);
  const source = grid.getTile(2, 2);
  const destination = grid.getTile(5, 5);
  source.growthScore = GROWTH_CONFIG.THRESHOLD_MEDIUM;
  const sim = new Simulation(grid);
  sim.computeStats();
  const beforeFire = sim.stats.population;
  source.onFire = true;
  grid.activeFireTiles.add(source);
  const previousRandom = Math.random;
  Math.random = () => 0.99;
  try {
    sim.tick();
  } finally {
    Math.random = previousRandom;
  }
  assert.ok(destination.population > 1, 'Fire evacuation bypasses migration shift caps to move residents immediately');
  assert.ok(source.population < beforeFire, 'Burning home loses residents immediately');
  assert.ok(sim.stats.population <= beforeFire, 'Moving households within the city does not create a population spike');
}
