import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { FireManager } from '../src/engine/FireManager.js';
import { CoverageManager } from '../src/engine/CoverageManager.js';
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
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.POLICE_STATION].cost, 200, 'Police tier-1 construction cost should be $200');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.FIRE_STATION].cost, 500, 'Fire tier-1 construction cost should be $500');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.HOSPITAL].cost, 300, 'Hospital tier-1 construction cost should be $300');

ServiceManager.updateServices(grid, 0, 1);
const lightJobs = police.totalJobs;
const lightRadius = police.effectiveRadius;
assert.strictEqual(lightJobs, 1, 'Police should start with one officer slot');
assert.strictEqual(fire.totalJobs, 1, 'Fire should start with one firefighter slot');
assert.strictEqual(hospital.totalJobs, 1, 'Hospital should start with one staff slot');

const offlineFire = grid.placeProducer(5, 5, PRODUCER_TYPE.FIRE_STATION, 0);
offlineFire.operational = false;
ServiceManager.updateServices(grid, 0, 0);
assert.strictEqual(offlineFire.totalJobs, 1, 'Offline fire stations should retain the minimum staffing slot');
assert.strictEqual(offlineFire.filledJobs, 0, 'Offline fire stations should not fill jobs without residents');

ServiceManager.updateServices(grid, 6, 1, 6);
assert.strictEqual(fire.filledJobs, 1, 'Fire station should receive one worker when the city has six residents');
power.capacity = 0;
for (let tick = 1; tick <= SERVICE_GLOBAL_CONFIG.UTILITY_FAILURE_GRACE_TICKS; tick++) {
  UtilityManager.allocateAll(grid);
  assert.strictEqual(fire.operational, true, `Fire station should remain operational during utility grace tick ${tick}`);
}
UtilityManager.allocateAll(grid);
assert.strictEqual(fire.operational, false, 'Fire station should go offline after the utility grace period');
assert.strictEqual(fire.filledJobs, 1, 'Fire station staffing should remain visible while utilities are offline');
power.capacity = 100;
UtilityManager.allocateAll(grid);
assert.strictEqual(fire.operational, true, 'Fire station should recover when utilities return');
assert.strictEqual(fire.utilityFailureTicks, 0, 'Utility failure counter should reset after recovery');
ServiceManager.updateServices(grid, 6, 1);
const burningTile = grid.getTile(3, 3);
burningTile.onFire = true;
burningTile.fireDamage = 0;
FireManager.updateFires(grid, { fireInjuries: 0, displacedPopulation: 0 });
assert.strictEqual(burningTile.onFire, false, 'Operational staffed fire station should extinguish a nearby fire');
assert.strictEqual(burningTile.fireDamage, 0, 'Suppressed fire should have no remaining damage');
ServiceManager.updateServices(grid, 5000, 1);
assert.strictEqual(police.density, DENSITY.LIGHT, 'Tier 1 police stay at light density until upgraded');
assert.strictEqual(police.totalJobs, 5, 'Tier 1 police should cap at five officers');
assert.strictEqual(fire.totalJobs, 5, 'Tier 1 fire should cap at five firefighters');
assert.strictEqual(hospital.totalJobs, 5, 'Tier 1 hospital should cap at five staff');
assert.ok(police.totalJobs > lightJobs, 'Police jobs should grow with population');
assert.ok(police.effectiveRadius > lightRadius, 'Police coverage should grow with staffing');
const fullBudgetJobs = police.totalJobs;
const fullBudgetCoverage = CoverageManager.getCoverageSet(grid, 'police').size;
const fullBudgetCost = police.runningCost;
police.budget = 50;
ServiceManager.updateServices(grid, 5000, 1);
assert.ok(police.totalJobs < fullBudgetJobs, 'Reduced budget should reduce service jobs');
assert.ok(CoverageManager.getCoverageSet(grid, 'police').size < fullBudgetCoverage, 'Reduced budget should reduce service coverage');
assert.ok(police.runningCost < fullBudgetCost, 'Reduced budget should reduce service running cost');

// Stage 2 - Coverage caching test
const cachedBefore = ServiceManager.previousEmergencyCoverage.get(grid);
assert.ok(cachedBefore, 'ServiceManager should record cached coverage metadata');
const sentinelTile = grid.getTile(3, 3);
sentinelTile.testMarker = 'preserved';
ServiceManager.updateServices(grid, 5000, 1);
const cachedAfter = ServiceManager.previousEmergencyCoverage.get(grid);
assert.strictEqual(cachedAfter, cachedBefore, 'Unchanged state should skip coverage/assignment and keep cached metadata');
assert.strictEqual(sentinelTile.testMarker, 'preserved', 'Skipped coverage should not re-wipe tile state');

// Population/workforce changes stop at the tier-1 cap once the budget is restored.
police.budget = 100;
ServiceManager.updateServices(grid, 10000, 1);
assert.strictEqual(police.totalJobs, 5, 'Tier 1 staffing stays capped at five as population grows');
assert.ok(police.runningCost > 0, 'A capped station still pays its staff wages');

// Building operational change invalidates cache
police.operational = false;
ServiceManager.updateServices(grid, 10000, 1);
assert.notStrictEqual(
  ServiceManager.previousEmergencyCoverage.get(grid).producerStateSignature,
  cachedBefore.producerStateSignature,
  'Operational change must update producer state signature and recalculate',
);

console.log('Service building utility and dynamic growth tests passed.');
