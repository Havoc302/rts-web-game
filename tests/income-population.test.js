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
residential.density = DENSITY.LIGHT;
const simulation = new Simulation(grid);
simulation.taxRate = 100;
simulation.computeStats();
const partialIncome = simulation.stats.incomePerTick;

residential.growthScore = 10;
simulation.computeStats();
const fullIncome = simulation.stats.incomePerTick;
assert.ok(fullIncome > partialIncome, 'Income should increase as residential population fills');

residential.growthScore = 0;
simulation.computeStats();
assert.strictEqual(simulation.stats.incomePerTick, partialIncome, 'Income should fall when population falls');

console.log('Population-based income tests passed.');
