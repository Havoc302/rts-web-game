import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { PRODUCER_TYPE, TERRAIN, DENSITY, SERVICE_CONFIG, SERVICE_GLOBAL_CONFIG } from '../src/config.js';

const grid = new Grid(14, 14, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}
grid.tiles[3][0].terrain = TERRAIN.WATER;
grid.tiles[5][0].terrain = TERRAIN.WATER;

const power = grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
const water = grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
const sewage = grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
const police = grid.placeProducer(3, 3, PRODUCER_TYPE.POLICE_STATION, 0);
const fire = grid.placeProducer(3, 4, PRODUCER_TYPE.FIRE_STATION, 0);
const hospital = grid.placeProducer(3, 5, PRODUCER_TYPE.HOSPITAL, 0);
for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);
water.usedCapacity = 0;
sewage.usedCapacity = 0;

UtilityManager.allocateAll(grid);
assert.strictEqual(police.operational, true, 'Police should be operational with all utilities connected');
assert.strictEqual(police.utilityShortfall.power, false);
assert.strictEqual(police.utilityShortfall.water, false);
assert.strictEqual(police.utilityShortfall.sewage, false);
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.POLICE_STATION].cost, 4000, 'Police construction cost should remain fixed');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.FIRE_STATION].cost, 4000, 'Fire construction cost should remain fixed');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.HOSPITAL].cost, 6000, 'Hospital construction cost should remain fixed');

ServiceManager.updateServices(grid, 0, 1);
const lightJobs = police.totalJobs;
const lightRadius = police.effectiveRadius;
assert.strictEqual(lightJobs, 2, 'Police should start with a minimum of two officers');
assert.strictEqual(fire.totalJobs, 2, 'Fire should start with a minimum of two firefighters');
assert.strictEqual(hospital.totalJobs, 2, 'Hospital should start with a minimum of two staff');

const offlineFire = grid.placeProducer(5, 5, PRODUCER_TYPE.FIRE_STATION, 0);
offlineFire.operational = false;
ServiceManager.updateServices(grid, 0, 0);
assert.strictEqual(offlineFire.totalJobs, 2, 'Offline fire stations should retain minimum staffing jobs');
assert.strictEqual(offlineFire.filledJobs, 1, 'Offline fire stations should still fill available staffing jobs');

power.capacity = 0;
for (let tick = 1; tick <= SERVICE_GLOBAL_CONFIG.UTILITY_FAILURE_GRACE_TICKS; tick++) {
  UtilityManager.allocateAll(grid);
  assert.strictEqual(fire.operational, true, `Fire station should remain operational during utility grace tick ${tick}`);
}
UtilityManager.allocateAll(grid);
assert.strictEqual(fire.operational, false, 'Fire station should go offline after the utility grace period');
power.capacity = 100;
UtilityManager.allocateAll(grid);
assert.strictEqual(fire.operational, true, 'Fire station should recover when utilities return');
assert.strictEqual(fire.utilityFailureTicks, 0, 'Utility failure counter should reset after recovery');
ServiceManager.updateServices(grid, 5000, 1);
assert.strictEqual(police.density, DENSITY.HIGH, 'Police density should grow with population');
assert.strictEqual(police.totalJobs, 5, 'Police should staff one officer per thousand residents');
assert.strictEqual(fire.totalJobs, 5, 'Fire should staff one firefighter per thousand residents');
assert.strictEqual(hospital.totalJobs, 5, 'Hospital should staff one worker per thousand residents');
assert.ok(police.totalJobs > lightJobs, 'Police jobs should grow with population');
assert.ok(police.effectiveRadius > lightRadius, 'Police coverage should grow with population');
const fullBudgetJobs = police.totalJobs;
const fullBudgetRadius = police.effectiveRadius;
const fullBudgetCost = police.runningCost;
police.budget = 50;
ServiceManager.updateServices(grid, 5000, 1);
assert.ok(police.totalJobs < fullBudgetJobs, 'Reduced budget should reduce service jobs');
assert.ok(police.effectiveRadius < fullBudgetRadius, 'Reduced budget should reduce service coverage');
assert.ok(police.runningCost < fullBudgetCost, 'Reduced budget should reduce service running cost');

console.log('Service building utility and dynamic growth tests passed.');
