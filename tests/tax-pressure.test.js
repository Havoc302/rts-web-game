import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, HAPPINESS_CONFIG, TERRAIN, ZONE } from '../src/config.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

const residential = grid.getTile(1, 1);
residential.zone = ZONE.RESIDENTIAL;
residential.density = DENSITY.HIGH;
residential.growthScore = 50;
grid.activeZonedTiles.add(residential);

const industrial = grid.getTile(1, 2);
industrial.zone = ZONE.INDUSTRIAL;
industrial.density = DENSITY.HIGH;
grid.activeZonedTiles.add(industrial);

const simulation = new Simulation(grid);
simulation.taxRate = 40;
simulation.computeStats();
const populationAt40 = simulation.stats.population;
const jobsAt40 = simulation.stats.totalJobsProvided;

simulation.taxRate = 0;
const lowTaxModifier = simulation.getTaxGrowthModifier();
assert.ok(lowTaxModifier > 0, 'Zero tax should provide a positive residential attraction modifier');
simulation.taxRate = 0;
residential.shortfall = { power: false, water: false, sewage: false };
const zeroTaxHappiness = simulation.resourceManager.calculateHappiness(
  grid,
  { ...simulation.stats, taxRate: 0 },
  0,
  false,
);
assert.ok(zeroTaxHappiness > 50, 'Zero tax should improve happiness above the neutral baseline');

simulation.taxRate = 50;
simulation.computeStats();
assert.ok(simulation.stats.population <= populationAt40, 'Tax at 50% should stop population growth');
assert.strictEqual(simulation.stats.totalJobsProvided, jobsAt40, 'Job capacity should begin reducing above 50% tax');

simulation.taxRate = 100;
for (let i = 0; i < 10; i++) simulation.updateGrowthAndDensity();
simulation.computeStats();
assert.ok(simulation.stats.population < populationAt40, '100% tax should reduce population strongly over time');
assert.ok(simulation.stats.totalJobsProvided < jobsAt40, '100% tax should reduce available jobs strongly');

// Happiness at high tax — even with full employment and utilities, >50% tax must push happiness below 50.
{
  const happyGrid = new Grid(6, 6, 1);
  for (const row of happyGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const res = happyGrid.getTile(1, 1);
  res.zone = ZONE.RESIDENTIAL;
  res.density = DENSITY.HIGH;
  res.growthScore = 50;
  res.shortfall = { power: false, water: false, sewage: false };
  // Give it all civic services
  res.services = { police: true, fire: true, hospital: true, school: true, library: true, cityHall: true };
  happyGrid.activeZonedTiles.add(res);
  const manager = new ResourceManager();

  const statsBase = { taxRate: 100, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 };
  const highTaxHappiness = manager.calculateHappiness(happyGrid, statsBase, 1, false);
  assert.ok(highTaxHappiness < 50, `100% tax with full services and goods should force happiness below 50 (got ${highTaxHappiness})`);

  const statsNeutral = { taxRate: HAPPINESS_CONFIG.TAX_NEUTRAL_RATE, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 };
  const neutralHappiness = manager.calculateHappiness(happyGrid, statsNeutral, 0, false);
  assert.ok(neutralHappiness >= 50, `Neutral tax with full services should keep happiness at or above 50 (got ${neutralHappiness})`);
}

console.log('High-tax population and jobs tests passed.');
