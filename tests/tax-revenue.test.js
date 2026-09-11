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

const commercial = grid.getTile(1, 2);
commercial.zone = ZONE.COMMERCIAL;
commercial.density = DENSITY.LIGHT;

const simulation = new Simulation(grid);
simulation.taxRate = 100;
simulation.computeStats();

assert.strictEqual(simulation.stats.population, 500, 'Test population should be fully occupied');
assert.strictEqual(simulation.stats.jobsFilled, 7, 'High tax pressure should reduce available jobs before worker tax is collected');
assert.strictEqual(simulation.stats.incomePerTick, 51, 'Residents and employed workers should each be taxed at ten per 100 after scaling');

simulation.taxRate = 50;
simulation.computeStats();
assert.strictEqual(simulation.stats.incomePerTick, 26, 'Tax rate should scale total resident and worker revenue');

console.log('Resident and worker tax revenue tests passed.');