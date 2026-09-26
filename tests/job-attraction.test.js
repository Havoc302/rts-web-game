import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, GROWTH_CONFIG, LABOR_TAX_GROWTH_CONFIG, TERRAIN, ZONE } from '../src/config.js';

console.log('=== job-attraction.test.js ===');

function setupTest() {
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) {
    for (const tile of row) tile.terrain = TERRAIN.FLAT;
  }
  const residential = grid.getTile(2, 2);
  residential.zone = ZONE.RESIDENTIAL;
  residential.density = DENSITY.LIGHT;
  residential.growthScore = 0;
  residential.shortfall = { power: false, water: false, sewage: false };
  grid.activeZonedTiles.add(residential);

  const sim = new Simulation(grid);
  sim.taxRate = 40; // Neutral tax modifier (0)
  sim.stats.happinessGrowthModifier = 0;
  sim.stats.unemployedWorkers = 0;
  return { grid, residential, sim };
}

// 1. High Vacancies (employmentRate = 0, totalJobs > 0) -> Max +3 bonus (+1 serviced + 3 bonus = +4 delta)
{
  const { residential, sim } = setupTest();
  sim.stats.totalJobsProvided = 50;
  sim.stats.employmentRate = 0; // 100% vacancy
  sim.updateGrowthAndDensity();
  assert.strictEqual(residential.growthScore, GROWTH_CONFIG.SERVICED_DELTA + LABOR_TAX_GROWTH_CONFIG.MAX_JOB_ATTRACTION_BONUS, '100% job vacancy adds max job attraction bonus (+4 total)');
}

// 2. Equilibrium (employmentRate = 1.0) -> +0 bonus (+1 serviced + 0 bonus = +1 delta)
{
  const { residential, sim } = setupTest();
  sim.stats.totalJobsProvided = 50;
  sim.stats.employmentRate = 1.0; // 0% vacancy
  sim.updateGrowthAndDensity();
  assert.strictEqual(residential.growthScore, GROWTH_CONFIG.SERVICED_DELTA, 'Full employment adds zero job attraction bonus (+1 total)');
}

// 3. Partial Vacancy (employmentRate = 0.5) -> round(3 * 0.5) = +2 bonus (+1 serviced + 2 = +3 delta)
{
  const { residential, sim } = setupTest();
  sim.stats.totalJobsProvided = 50;
  sim.stats.employmentRate = 0.5; // 50% vacancy
  sim.updateGrowthAndDensity();
  assert.strictEqual(residential.growthScore, GROWTH_CONFIG.SERVICED_DELTA + 2, '50% vacancy scales job attraction bonus (+3 total)');
}

// 4. Zero-Job Boundary Condition (totalJobs = 0) -> No bonus, growth hard-stopped at 0
{
  const { residential, sim } = setupTest();
  sim.stats.totalJobsProvided = 0;
  sim.stats.employmentRate = 0;
  sim.updateGrowthAndDensity();
  assert.strictEqual(residential.growthScore, 0, 'Zero jobs hard-stops residential growth at 0');
}

// 5. Utility Gate: Shortfall disables job attraction bonus (shortfall delta -2 applies)
{
  const { residential, sim } = setupTest();
  residential.growthScore = 10;
  residential.shortfall.power = true;
  sim.stats.totalJobsProvided = 50;
  sim.stats.employmentRate = 0; // High vacancy, but power is out
  sim.updateGrowthAndDensity();
  assert.strictEqual(residential.growthScore, 10 + GROWTH_CONFIG.SHORTFALL_DELTA, 'Utility shortfall ignores job attraction and applies shortfall penalty (-2)');
}

console.log('Job attraction tests passed.');
