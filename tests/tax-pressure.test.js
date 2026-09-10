import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, TERRAIN, ZONE } from '../src/config.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

const residential = grid.getTile(1, 1);
residential.zone = ZONE.RESIDENTIAL;
residential.density = DENSITY.HIGH;
residential.growthScore = 50;

const industrial = grid.getTile(1, 2);
industrial.zone = ZONE.INDUSTRIAL;
industrial.density = DENSITY.HIGH;

const simulation = new Simulation(grid);
simulation.taxRate = 40;
simulation.computeStats();
const populationAt40 = simulation.stats.population;
const jobsAt40 = simulation.stats.totalJobsProvided;

simulation.taxRate = 0;
const lowTaxModifier = simulation.getTaxGrowthModifier();
assert.ok(lowTaxModifier > 0, 'Zero tax should provide a positive residential attraction modifier');

simulation.taxRate = 50;
simulation.computeStats();
assert.ok(simulation.stats.population <= populationAt40, 'Tax at 50% should stop population growth');
assert.strictEqual(simulation.stats.totalJobsProvided, jobsAt40, 'Job capacity should begin reducing above 50% tax');

simulation.taxRate = 100;
for (let i = 0; i < 10; i++) simulation.updateGrowthAndDensity();
simulation.computeStats();
assert.ok(simulation.stats.population < populationAt40, '100% tax should reduce population strongly over time');
assert.ok(simulation.stats.totalJobsProvided < jobsAt40, '100% tax should reduce available jobs strongly');

console.log('High-tax population and jobs tests passed.');
