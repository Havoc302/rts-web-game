import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { happinessDemandModifier } from '../src/engine/ResourceManager.js';
import { DENSITY, HAPPINESS_CONFIG, TERRAIN, ZONE } from '../src/config.js';

assert.strictEqual(happinessDemandModifier(HAPPINESS_CONFIG.BASE_SCORE), 0, 'Neutral happiness should neither attract nor repel residents');
assert.strictEqual(happinessDemandModifier(100), 50 * HAPPINESS_CONFIG.GROWTH_DELTA_PER_POINT, 'Full happiness should attract residents');
assert.strictEqual(happinessDemandModifier(0), -50 * HAPPINESS_CONFIG.GROWTH_DELTA_PER_POINT, 'Zero happiness should drive residents out');

function servicedResidential(growthScore, jobsNearby = true) {
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  grid.placeRoad(2, 2);
  const home = grid.getTile(2, 1);
  home.terrain = TERRAIN.FLAT;
  home.zone = ZONE.RESIDENTIAL;
  home.density = DENSITY.HIGH;
  home.growthScore = growthScore;
  home.shortfall = { power: false, water: false, sewage: false };
  grid.activeZonedTiles.add(home);
  if (jobsNearby) {
    const jobs = grid.getTile(2, 3);
    jobs.zone = ZONE.INDUSTRIAL;
    jobs.density = DENSITY.HIGH;
    grid.activeZonedTiles.add(jobs);
  }
  return { grid, home, simulation: new Simulation(grid) };
}

{
  const { home, simulation } = servicedResidential(25);
  simulation.stats.happinessGrowthModifier = 0;
  simulation.stats.unemployedWorkers = 0;
  simulation.stats.totalJobsProvided = 10;
  simulation.stats.employmentRate = 1; // Jobs fully filled; vacancy bonus = 0
  simulation.updateGrowthAndDensity();
  const neutral = home.growthScore;

  home.growthScore = 25;
  simulation.stats.happinessGrowthModifier = happinessDemandModifier(100);
  simulation.updateGrowthAndDensity();
  assert.ok(home.growthScore > neutral, 'High mayor rating should grow residential demand');

  home.growthScore = 25;
  simulation.stats.happinessGrowthModifier = happinessDemandModifier(0);
  simulation.updateGrowthAndDensity();
  assert.ok(home.growthScore < 25, 'Low mayor rating should shrink residential demand');
}

{
  const { home, simulation } = servicedResidential(40);
  home.shortfall = { power: false, water: false, sewage: false };
  simulation.stats.happinessGrowthModifier = happinessDemandModifier(0);
  simulation.stats.unemployedWorkers = 0;
  simulation.stats.totalJobsProvided = 10;
  simulation.stats.employmentRate = 1; // Jobs fully filled; vacancy bonus = 0
  simulation.computeStats();
  const populationBefore = simulation.stats.population;
  simulation.updateGrowthAndDensity();
  simulation.computeStats();
  assert.ok(home.growthScore < 40, 'Unhappy residents should reduce growth score');
  assert.ok(simulation.stats.population < populationBefore, 'Falling growth should empty occupancy');
  assert.strictEqual(home.density, DENSITY.HIGH, 'Unhappiness should abandon homes, not downgrade density');
}

console.log('Happiness demand tests passed.');
