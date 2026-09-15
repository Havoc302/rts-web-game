import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(14, 14, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}
grid.tiles[3][0].terrain = TERRAIN.WATER;
grid.tiles[5][0].terrain = TERRAIN.WATER;

grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
const hospital = grid.placeProducer(3, 5, PRODUCER_TYPE.HOSPITAL, 0);
const police = grid.placeProducer(3, 3, PRODUCER_TYPE.POLICE_STATION, 0);
for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

const sim = new Simulation(grid);
sim.tick();

assert.ok(hospital.totalJobs >= 2, 'Hospital should keep ServiceManager job count after a full tick');
assert.notStrictEqual(hospital.totalJobs, 10, 'Hospital jobs must not be clobbered to jobs.light');
assert.ok(police.totalJobs >= 2, 'Police should keep ServiceManager job count after a full tick');
assert.notStrictEqual(police.totalJobs, 10, 'Police jobs must not be clobbered to jobs.light');

console.log('Staffing ownership tests passed.');
