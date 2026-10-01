import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { DENSITY, PRODUCER_TYPE, SERVICE_CONFIG, SERVICE_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(10, 10, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

const police = grid.placeProducer(3, 3, PRODUCER_TYPE.POLICE_STATION, 0);
grid.placeRoad(2, 3);
ServiceManager.updateServices(grid, 1, 1);

assert.ok(police.runningCost > 0, 'A staffed police station should have a running cost');
assert.ok(police.runningCost < 20, 'Tiny-city service cost should not be based on total population');
assert.strictEqual(ServiceManager.getOperatingCost(police.type, police.density, police.filledJobs, police.totalJobs), police.runningCost, 'The build-info cost formula must match live staffing expenses');
assert.strictEqual(ServiceManager.getOperatingCost(SERVICE_TYPE.POLICE_STATION, DENSITY.LIGHT, SERVICE_CONFIG[SERVICE_TYPE.POLICE_STATION].jobs.light, SERVICE_CONFIG[SERVICE_TYPE.POLICE_STATION].jobs.light), 29, 'Full-staff police build info includes utility overhead');
assert.strictEqual(ServiceManager.getOperatingCost(SERVICE_TYPE.CITY_HALL, DENSITY.HIGH, SERVICE_CONFIG[SERVICE_TYPE.CITY_HALL].jobs.high, SERVICE_CONFIG[SERVICE_TYPE.CITY_HALL].jobs.high), 0, 'City Hall has no configured direct operating expense');

console.log('Service expense scaling tests passed.');