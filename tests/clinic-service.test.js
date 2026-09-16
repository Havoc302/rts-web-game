import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { ServiceManager } from '../src/engine/ServiceManager.js';
import { Simulation } from '../src/engine/Simulation.js';
import { PRODUCER_TYPE, TERRAIN, DENSITY, SERVICE_CONFIG, MEDICAL_CONFIG } from '../src/config.js';

const grid = new Grid(10, 10, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

// Check configuration
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC].cost, 2000, 'Clinic should cost $2,000');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC].maxPopulationServed, 5000, 'Clinic serves up to 5,000 people');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC].jobs.light, 5, 'Clinic has 5 jobs');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC].jobs.medium, 5, 'Clinic does not grow larger in jobs');
assert.strictEqual(SERVICE_CONFIG[PRODUCER_TYPE.CLINIC].jobs.high, 5, 'Clinic does not grow larger in jobs');

// Place utilities and clinic
const power = grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
const water = grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
const sewage = grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
const clinic = grid.placeProducer(3, 3, PRODUCER_TYPE.CLINIC, 0);
for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

UtilityManager.allocateAll(grid);
assert.strictEqual(clinic.operational, true, 'Clinic should be operational with utilities');

// Staffing at low population (1,000)
ServiceManager.updateServices(grid, 1000, 1, 1000);
assert.strictEqual(clinic.totalJobs, 2, 'Clinic minimum staffing baseline should be 2 at 1000 pop (1 staff per 1000)');
assert.strictEqual(clinic.filledJobs, 2, 'Clinic fills 2 jobs');
assert.strictEqual(clinic.density, DENSITY.LIGHT, 'Clinic stays at LIGHT density');

// Staffing at 5,000 population
ServiceManager.updateServices(grid, 5000, 1, 5000);
assert.strictEqual(clinic.totalJobs, 5, 'Clinic should reach cap of 5 jobs at 5,000 population');
assert.strictEqual(clinic.filledJobs, 5, 'Clinic fills 5 jobs');
assert.strictEqual(clinic.density, DENSITY.LIGHT, 'Clinic stays at LIGHT density even at 5000 pop');

// Staffing at 20,000 population - clinic does NOT grow larger
ServiceManager.updateServices(grid, 20000, 1, 20000);
assert.strictEqual(clinic.totalJobs, 5, 'Clinic does not exceed 5 jobs even at 20,000 population');
assert.strictEqual(clinic.filledJobs, 5, 'Clinic filled jobs stay capped at 5');
assert.strictEqual(clinic.density, DENSITY.LIGHT, 'Clinic remains LIGHT density at higher population');

// Hospital coverage and patient capacity integration
const tile = grid.getTile(3, 4);
assert.strictEqual(tile.services.hospital, true, 'Clinic provides hospital service coverage');

const sim = new Simulation(grid);
sim.computeStats();
assert.strictEqual(
  sim.stats.patientCapacity,
  5 * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB,
  'Clinic filled jobs provide patient capacity to city stats',
);

console.log('Clinic civic service tests passed.');

