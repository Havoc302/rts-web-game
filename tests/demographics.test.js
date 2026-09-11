import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import {
  DENSITY,
  DEMOGRAPHICS_CONFIG,
  JOBS_PROVIDED,
  MEDICAL_CONFIG,
  TAX_REVENUE_CONFIG,
  TERRAIN,
  ZONE,
  jobsProvidedFor,
  splitDemographics,
} from '../src/config.js';

function occupiedResidential(grid, density = DENSITY.HIGH) {
  const tile = grid.getTile(1, 1);
  tile.terrain = TERRAIN.FLAT;
  tile.zone = ZONE.RESIDENTIAL;
  tile.density = density;
  tile.growthScore = 50;
  return tile;
}

{
  const lightJobs = {
    commercial: jobsProvidedFor(ZONE.COMMERCIAL, DENSITY.LIGHT),
    industrial: jobsProvidedFor(ZONE.INDUSTRIAL, DENSITY.LIGHT),
    agricultural: jobsProvidedFor(ZONE.AGRICULTURAL, DENSITY.LIGHT),
  };
  assert.strictEqual(lightJobs.commercial, JOBS_PROVIDED[ZONE.COMMERCIAL][DENSITY.LIGHT]);
  assert.strictEqual(lightJobs.commercial, lightJobs.industrial, 'Commercial and industrial tiles should provide the same jobs at the same density');
  assert.ok(lightJobs.industrial > lightJobs.agricultural, 'Industrial tiles should provide more jobs than agricultural at the same density');
  assert.ok(
    Math.abs(lightJobs.commercial / lightJobs.agricultural - DEMOGRAPHICS_CONFIG.JOB_SHARE[ZONE.COMMERCIAL] / DEMOGRAPHICS_CONFIG.JOB_SHARE[ZONE.AGRICULTURAL]) < 0.4,
    'Job capacities should follow the 40/40/20 commercial/industrial/agricultural mix',
  );
  console.log('✔ Job capacities stay relative to housing and the 40/40/20 sector mix');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  occupiedResidential(grid);

  const simulation = new Simulation(grid);
  simulation.computeStats();

  const expected = splitDemographics(500);
  assert.strictEqual(simulation.stats.population, 500);
  assert.strictEqual(simulation.stats.totalEmployablePopulation, expected.workforce, 'Workforce should be the working share of population');
  assert.strictEqual(simulation.stats.schoolAge, expected.schoolAge, 'School-age should be tracked separately from retirees');
  assert.strictEqual(simulation.stats.retirees, expected.retirees, 'Retirees should be a separate population share');
  assert.ok(expected.workforce + expected.schoolAge + expected.retirees < 500, 'Some residents are preschool or otherwise not working');
  console.log('✔ Population splits into workers, school-age, and retirees');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  occupiedResidential(grid);

  const commercial = grid.getTile(1, 2);
  commercial.zone = ZONE.COMMERCIAL;
  commercial.density = DENSITY.HIGH;

  const simulation = new Simulation(grid);
  simulation.computeStats();

  const workforce = splitDemographics(500).workforce;
  const commercialJobs = JOBS_PROVIDED[ZONE.COMMERCIAL][DENSITY.HIGH];
  assert.strictEqual(
    simulation.stats.jobsFilled,
    Math.min(commercialJobs, workforce),
    'Workers fill any available jobs up to the workforce size',
  );
  console.log('✔ Workers fill job tiles as a single pool');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  occupiedResidential(grid);

  const simulation = new Simulation(grid);
  simulation.taxRate = 40;
  simulation.pensionBudget = 100;
  simulation.computeStats();

  const retirees = splitDemographics(500).retirees;
  const taxPerWorker = TAX_REVENUE_CONFIG.MONEY_PER_TAX_UNIT * 0.4 / TAX_REVENUE_CONFIG.RESIDENTS_PER_TAX_UNIT;
  const expectedPension = Math.round(retirees * taxPerWorker * DEMOGRAPHICS_CONFIG.PENSION_VS_WORKER_TAX);
  assert.strictEqual(simulation.stats.pensionExpenses, expectedPension, 'Pensions cost half the residential tax paid per worker');
  assert.ok(simulation.stats.serviceExpenses >= expectedPension, 'Pension cost is paid like a utility expense');

  const patientsAtFull = simulation.stats.patientDemand;
  simulation.pensionBudget = 0;
  simulation.computeStats();
  assert.strictEqual(simulation.stats.pensionExpenses, 0, 'Zero pension funding should pay no pension');
  assert.ok(simulation.stats.patientDemand > patientsAtFull, 'Cutting pension funding should increase retiree hospital demand');
  console.log('✔ Pension slider costs money and underfunding hurts retiree health');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  occupiedResidential(grid);
  const simulation = new Simulation(grid);
  simulation.computeStats();
  const baseline = simulation.stats.patientDemand;

  const retirees = splitDemographics(500).retirees;
  const extra = retirees * MEDICAL_CONFIG.PATIENTS_PER_RESIDENT * (DEMOGRAPHICS_CONFIG.RETIREE_PATIENT_MULTIPLIER - 1);
  assert.ok(baseline >= extra, 'Retirees should generate more hospital demand than working-age residents even when funded');
  console.log('✔ Retirees use hospitals more than the rest of the population');
}

console.log('Demographics and pension tests passed.');
