import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';
import { HAPPINESS_CONFIG, SERVICE_GLOBAL_CONFIG, TERRAIN, ZONE } from '../src/config.js';

console.log('=== waterfront.test.js ===');

function setup() {
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let y = 0; y < 10; y++) grid.getTile(0, y).terrain = TERRAIN.WATER;
  for (let y = 0; y < 10; y++) grid.placeRoad(2, y);
  grid.placeZone(1, 2, ZONE.RESIDENTIAL); // waterfront
  grid.placeZone(3, 2, ZONE.RESIDENTIAL); // inland
  for (const tile of [grid.getTile(1, 2), grid.getTile(3, 2)]) {
    tile.shortfall = { power: false, water: false, sewage: false };
    tile.growthScore = 10;
    tile.population = 10;
  }
  return grid;
}

function growthSim(grid) {
  const sim = new Simulation(grid);
  sim.taxRate = 40;
  sim.stats.happinessGrowthModifier = 0;
  sim.stats.totalJobsProvided = 50;
  sim.stats.employmentRate = 1;
  sim.stats.unemployedWorkers = 0;
  return sim;
}

assert.strictEqual(setup().getWaterfrontStatus(1, 2), 'clean');
assert.strictEqual(setup().getWaterfrontStatus(3, 2), null);

// Growth: clean waterfront gains the bonus relative to an identical inland tile.
{
  const grid = setup();
  const sim = growthSim(grid);
  sim.updateGrowthAndDensity();
  const diff = grid.getTile(1, 2).growthScore - grid.getTile(3, 2).growthScore;
  assert.strictEqual(diff, SERVICE_GLOBAL_CONFIG.CLEAN_WATERFRONT_GROWTH_BONUS, 'Clean waterfront should add a growth bonus');
}

// Growth: polluted waterfront takes the penalty.
{
  const grid = setup();
  grid.getTile(0, 2).riverPollution = 20;
  assert.strictEqual(grid.getWaterfrontStatus(1, 2), 'polluted');
  const sim = growthSim(grid);
  sim.updateGrowthAndDensity();
  const diff = grid.getTile(1, 2).growthScore - grid.getTile(3, 2).growthScore;
  assert.strictEqual(diff, SERVICE_GLOBAL_CONFIG.POLLUTED_WATERFRONT_GROWTH_PENALTY, 'Polluted waterfront should apply a growth penalty');
}

// Happiness: population-weighted waterfront shares.
{
  const grid = setup();
  const manager = new ResourceManager();
  const residential = [grid.getTile(1, 2), grid.getTile(3, 2)];
  assert.deepStrictEqual(manager.getWaterfrontShares(grid, residential), { cleanShare: 0.5, pollutedShare: 0 });
  const stats = { taxRate: 40, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 };
  const clean = manager.calculateHappiness(grid, stats, 0, false);
  grid.getTile(0, 2).riverPollution = 20;
  const polluted = manager.calculateHappiness(grid, stats, 0, false);
  const expected = 0.5 * HAPPINESS_CONFIG.CLEAN_WATERFRONT_MAX_BONUS + 0.5 * HAPPINESS_CONFIG.POLLUTED_WATERFRONT_MAX_PENALTY;
  assert.ok(Math.abs((clean - polluted) - expected) < 1e-9, 'Polluting the river should swap the waterfront bonus for a penalty');
}

console.log('Waterfront tests passed.');
