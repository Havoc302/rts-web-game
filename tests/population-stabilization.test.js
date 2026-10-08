import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, GROWTH_CONFIG, POPULATION_STABILIZATION_CONFIG, TERRAIN, ZONE } from '../src/config.js';

console.log('=== population-stabilization.test.js ===');

// 1. Config assertions
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.MAX_POPULATION_GROWTH_CAPACITY_RATIO, 0.01, 'Growth starts at 1% of residential capacity');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.GROWTH_SATURATION_FACTOR, 4, 'Growth tapers with residential occupancy');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.MAX_POPULATION_OUTFLOW_PER_TICK, 0.015, 'Outflow remains capped at 1.5%');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.MIN_POPULATION_SHIFT_FLOOR, 1, 'Floor shift is 1');

// 2. processPopulationTick unit tests
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);
  sim.stats.maxPopulationCapacity = 5000;

  // Zero delta
  sim.stats.population = 1000;
  assert.strictEqual(sim.processPopulationTick(0), 0, 'Zero delta returns 0');
  assert.strictEqual(sim.stats.population, 1000, 'Zero delta does not change population');

  // Outflow retains its proportional cap: -3000 at 1000 pop clamps to -15.
  const clampedDrop = sim.processPopulationTick(-3000);
  assert.strictEqual(clampedDrop, -15, 'Transient -3,000 drop at 1,000 pop clamps to 1.5%');
  assert.strictEqual(sim.stats.population, 985, 'Population drops to 985');

  // Growth is relative to capacity and tapers as housing occupancy rises.
  const clampedSurge = sim.processPopulationTick(500);
  assert.strictEqual(clampedSurge, 27, 'Surge at 985 population and 5,000 capacity clamps to 27');
  assert.strictEqual(sim.stats.population, 1012, 'Population increases by the capacity-relative growth cap');

  // Small delta within limits is uninhibited
  sim.stats.population = 1000;
  const smallDelta = sim.processPopulationTick(5);
  assert.strictEqual(smallDelta, 5, 'Delta within max shift is applied directly');
  assert.strictEqual(sim.stats.population, 1005, 'Population increases by exact small delta');

  // Early growth uses a larger cap, which tapers as the city fills.
  sim.stats.population = 0;
  const earlyGrowth = sim.processPopulationTick(100);
  assert.strictEqual(earlyGrowth, 50, 'Zero population uses 1% of the 5,000 residential capacity');
  assert.strictEqual(sim.stats.population, 50, 'Population increases by the capacity-relative cap');
  assert.strictEqual(sim.getMaxPopulationGrowth(1000), 27, 'Growth cap is 27 at 1,000 of 5,000 capacity');
  assert.strictEqual(sim.getMaxPopulationGrowth(5000), 10, 'Growth cap tapers to 10 at full occupancy');

  // Population never drops below 0
  sim.stats.population = 0;
  const negativeDrop = sim.processPopulationTick(-10);
  assert.strictEqual(negativeDrop, -1, 'Outflow floor allows a one-person drop');
  assert.strictEqual(sim.stats.population, 0, 'Population clamped at 0 lower bound');
}

// 3. Sustained crisis compound drain (~26% loss over 20 ticks)
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);
  sim.stats.population = 1000;

  for (let i = 0; i < 20; i++) {
    sim.processPopulationTick(-500); // Continuous crisis
  }

  // 1000 with integer floor 1.5% shifts over 20 ticks reaches 748 (~25.2% loss).
  assert.ok(sim.stats.population >= 735 && sim.stats.population <= 755, `20 ticks of sustained crisis yields ~25-26% loss (got ${sim.stats.population})`);
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
  assert.ok(sim.stats.population <= 5000 + sim.getMaxPopulationGrowth(5000), `One tick must respect the capacity-relative growth cap (got ${sim.stats.population})`);
  assert.strictEqual(sim.stats.population, Array.from(grid.activeZonedTiles).reduce((sum, tile) => sum + tile.population, 0), 'HUD and residential tile totals must agree');
  const afterGrowth = sim.stats.population;
  for (const tile of grid.activeZonedTiles) tile.growthScore = 0;
  sim.tick(false);
  assert.strictEqual(sim.stats.population, afterGrowth, 'Paused preview must not move residents toward their growth-score targets');
  sim.tick();
  assert.ok(sim.stats.population >= afterGrowth - Math.floor(afterGrowth * POPULATION_STABILIZATION_CONFIG.MAX_POPULATION_OUTFLOW_PER_TICK), 'One tick must not drive city outflow faster than 1.5%');
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
  assert.ok(destination.population > 1, 'Fire evacuation bypasses the one-person migration cap to move residents immediately');
  assert.ok(source.population < beforeFire, 'Burning home loses residents immediately');
  assert.ok(Math.abs(sim.stats.population - beforeFire) <= 1, 'Moving households within the city does not create a population spike');
}
