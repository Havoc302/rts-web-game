import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import { CoverageManager } from '../../src/engine/CoverageManager.js';
import { ServiceManager } from '../../src/engine/ServiceManager.js';
import { Simulation } from '../../src/engine/Simulation.js';
import {
  DENSITY,
  MEDICAL_CONFIG,
  PRODUCER_TYPE,
  SERVICE_CONFIG,
  SERVICE_TIER_CONFIG,
  SERVICE_TYPE,
  TERRAIN,
  BATTERY_TIER_CONFIG,
  SOLAR_TIER_CONFIG,
  WIND_TIER_CONFIG,
  getServiceTierCost,
  getServiceUpgradeCost,
  getServiceUtilityUsage,
  tierPriceLadder,
} from '../../src/config.js';

function flatGrid(size = 30) {
  const grid = new Grid(size, size, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

// The clinic is gone and the three emergency services are tiered.
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC], undefined, 'Clinic config should be removed');
assert.deepStrictEqual(SERVICE_TIER_CONFIG.maxStaff, [5, 10, 20]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.roadReach, [3, 6, 12]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.sideReach, [1, 2, 4]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.cells, [5, 10, 20]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.vehicles, [1, 2, 3]);

// Tier prices: first build, then 1.8x the previous tier, rounded to the nearest $10.
assert.deepStrictEqual(SERVICE_TIER_CONFIG.costs[SERVICE_TYPE.FIRE_STATION], [500, 900, 1620]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.costs[SERVICE_TYPE.HOSPITAL], [300, 540, 970]);
assert.deepStrictEqual(SERVICE_TIER_CONFIG.costs[SERVICE_TYPE.POLICE_STATION], [200, 360, 650]);
assert.strictEqual(getServiceTierCost(SERVICE_TYPE.FIRE_STATION, 1), 500);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.FIRE_STATION, 1), 900);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.FIRE_STATION, 2), 1620);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.FIRE_STATION, 3), 0);
assert.strictEqual(getServiceTierCost(SERVICE_TYPE.HOSPITAL, 1), 300);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.HOSPITAL, 1), 540);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.HOSPITAL, 2), 970);
assert.strictEqual(getServiceTierCost(SERVICE_TYPE.POLICE_STATION, 1), 200);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.POLICE_STATION, 1), 360);
assert.strictEqual(getServiceUpgradeCost(SERVICE_TYPE.POLICE_STATION, 2), 650);

// Upgrading must stay cheaper per unit of capacity than placing new tier-1 buildings.
for (const [type, ladder] of Object.entries(SERVICE_TIER_CONFIG.costs)) {
  const [first, second, third] = ladder;
  assert.ok(second < first * 2, `${type} tier-2 upgrade must beat two new tier-1 buildings`);
  assert.ok(third < first * 4, `${type} tier-3 upgrade must beat four new tier-1 buildings`);
}

// Power upgrades use the same 1.8x, $10-rounded ladder.
assert.deepStrictEqual(tierPriceLadder(500), [500, 900, 1620]);
assert.deepStrictEqual(WIND_TIER_CONFIG.cost, [500, 900, 1620]);
assert.deepStrictEqual(SOLAR_TIER_CONFIG.cost, [100, 180, 320]);
assert.deepStrictEqual(BATTERY_TIER_CONFIG.cost, [250, 450, 810]);
for (const ladder of [WIND_TIER_CONFIG.cost, SOLAR_TIER_CONFIG.cost, BATTERY_TIER_CONFIG.cost]) {
  const [first, second, third] = ladder;
  assert.ok(second < first * 2, 'A tier-2 power upgrade must beat two new tier-1 buildings');
  assert.ok(third < first * 4, 'A tier-3 power upgrade must beat four new tier-1 buildings');
  assert.strictEqual(second % 10, 0, 'Upgrade prices are rounded to the nearest $10');
  assert.strictEqual(third % 10, 0, 'Upgrade prices are rounded to the nearest $10');
}

// Tier 1 coverage: 3 road blocks each way and 1 side block at one staff member.
{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.POLICE_STATION, 0);
  for (let x = 8; x <= 22; x++) grid.placeRoad(x, 16);
  station.filledJobs = 1;

  const coverage = CoverageManager.getCoverageSet(grid, 'police');
  assert.ok(coverage.has('18,16'), 'One staff member should reach three road blocks');
  assert.ok(!coverage.has('19,17'), 'Coverage should stop after three road blocks and one side block');
  assert.ok(coverage.has('18,17'), 'One staff member should cover one block beside the road');
  assert.ok(!coverage.has('18,18'), 'Coverage should stop after one side block');

  const near = CoverageManager.getCoverageSource(grid, 'police', 16, 16);
  const far = CoverageManager.getCoverageSource(grid, 'police', 18, 16);
  assert.ok(near && far, 'Covered tiles should carry a responding-station record');
  assert.strictEqual(near.stationId, station.id);
  assert.ok(far.distance > near.distance, 'Distance should grow away from the station');
  assert.strictEqual(far.maxDistance, 4, 'Tier 1 with one staff covers four blocks at its edge');
}

// Five staff extend both the road reach and the side width by four blocks.
{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.POLICE_STATION, 0);
  for (let x = 8; x <= 30; x++) grid.placeRoad(x, 16);
  station.filledJobs = 5;

  const coverage = CoverageManager.getCoverageSet(grid, 'police');
  assert.ok(coverage.has('22,16'), 'Five staff should reach seven road blocks');
  assert.ok(!coverage.has('28,16'), 'Coverage should stop after seven road blocks plus five side blocks');
  assert.ok(coverage.has('22,21'), 'Five staff should cover five blocks beside the road');
  assert.ok(!coverage.has('22,22'), 'Coverage should stop after five side blocks');
}

// Tier upgrades double the base reach and raise the staff cap.
{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.POLICE_STATION, 0);
  for (let x = 8; x <= 30; x++) grid.placeRoad(x, 16);
  station.filledJobs = 1;
  assert.strictEqual(grid.upgradeProducer(grid.getTile(15, 15)), true);
  assert.strictEqual(station.tier, 2);
  station.filledJobs = 1;

  const coverage = CoverageManager.getCoverageSet(grid, 'police');
  assert.ok(coverage.has('21,16'), 'Tier 2 with one staff should reach six road blocks');
  assert.ok(!coverage.has('24,16'), 'Tier 2 should stop after six road blocks plus two side blocks');
  assert.ok(coverage.has('21,18'), 'Tier 2 should cover two side blocks');
  assert.ok(!coverage.has('21,19'), 'Tier 2 should stop after two side blocks');
}

// Staffing is population scaled with a one-person floor and the tier cap.
{
  const grid = flatGrid();
  grid.placeProducer(5, 5, PRODUCER_TYPE.POLICE_STATION, 0);
  grid.placeProducer(5, 8, PRODUCER_TYPE.FIRE_STATION, 0);
  grid.placeProducer(5, 11, PRODUCER_TYPE.HOSPITAL, 0);
  for (let y = 5; y <= 11; y++) grid.placeRoad(6, y);

  ServiceManager.updateServices(grid, 0, 1, 0);
  const police = grid.producers.find((p) => p.type === PRODUCER_TYPE.POLICE_STATION);
  assert.strictEqual(police.totalJobs, 1, 'A tier-1 station starts at one staff slot');
  assert.strictEqual(police.density, DENSITY.LIGHT);

  ServiceManager.updateServices(grid, 2500, 1, 2500);
  assert.strictEqual(police.totalJobs, 3, 'Population scales staffing up to the tier cap');
  ServiceManager.updateServices(grid, 50000, 1, 50000);
  assert.strictEqual(police.totalJobs, 5, 'Tier 1 caps staffing at five');

  grid.upgradeProducer(grid.getTile(5, 5));
  ServiceManager.updateServices(grid, 50000, 1, 50000);
  assert.strictEqual(police.totalJobs, 10, 'Tier 2 raises the staff cap to ten');
}

// Hospital beds are ten per staff member, and the patient count is shared out.
{
  const grid = flatGrid(12);
  const hospital = grid.placeProducer(3, 3, PRODUCER_TYPE.HOSPITAL, 0);
  for (let y = 2; y <= 5; y++) grid.placeRoad(2, y);
  hospital.filledJobs = 5;
  hospital.totalJobs = 5;
  const sim = new Simulation(grid);
  sim.assignHospitalPatients({ patientDemand: 30 });
  assert.strictEqual(
    5 * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB,
    50,
    'Tier 1 at full staff handles fifty patients',
  );
  assert.strictEqual(hospital.patients, 30, 'Treated patients are recorded on the hospital');
}

// Dynamic utility load rises with staff, patients and prisoners.
{
  const fireUsage = getServiceUtilityUsage(SERVICE_TYPE.FIRE_STATION, 1, { filledJobs: 5 });
  assert.strictEqual(fireUsage.power, 2, 'Five firefighters draw two power');
  assert.strictEqual(fireUsage.water, 1.5);
  const hospitalUsage = getServiceUtilityUsage(SERVICE_TYPE.HOSPITAL, 1, { filledJobs: 5, patients: 50 });
  assert.strictEqual(hospitalUsage.power, 4);
  assert.strictEqual(hospitalUsage.water, 5);
  const policeUsage = getServiceUtilityUsage(SERVICE_TYPE.POLICE_STATION, 1, { filledJobs: 5, prisoners: 5 });
  assert.strictEqual(policeUsage.power, 2.5);
  assert.strictEqual(policeUsage.water, 2);
}

console.log('Service tier tests passed.');
