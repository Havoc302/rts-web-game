import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, EDUCATION_CONFIG, GROWTH_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

console.log('=== education.test.js ===');

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} (got ${a}, expected ${b})`);

function setup({ withTown = true } = {}) {
  const grid = new Grid(12, 12, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let x = 0; x < 12; x++) grid.placeRoad(x, 1);
  let home = null;
  if (withTown) {
    grid.placeZone(1, 2, ZONE.RESIDENTIAL);
    home = grid.getTile(1, 2);
    home.density = DENSITY.HIGH;
    home.growthScore = GROWTH_CONFIG.MAX_SCORE;
  }
  const school = grid.placeProducer(3, 2, PRODUCER_TYPE.SCHOOL);
  const university = grid.placeProducer(4, 2, PRODUCER_TYPE.UNIVERSITY);
  const library = grid.placeProducer(5, 2, PRODUCER_TYPE.LIBRARY);
  for (const p of [school, university, library]) p.filledJobs = 0;
  const sim = new Simulation(grid);
  sim.taxRate = 40;
  return { grid, sim, home, school, university, library };
}

const seatsJobs = (demand) => Math.ceil(demand / EDUCATION_CONFIG.STUDENT_CAPACITY_PER_JOB);

// Zero population: no demand and a neutral multiplier, even with staffed buildings.
{
  const { sim, school, university } = setup({ withTown: false });
  school.filledJobs = 10;
  university.filledJobs = 10;
  sim.computeStats();
  assert.strictEqual(sim.stats.population, 0);
  assert.strictEqual(sim.stats.schoolDemand, 0);
  assert.strictEqual(sim.stats.universityDemand, 0);
  assert.strictEqual(sim.stats.educationTaxMultiplier, 1, 'Zero population must give a neutral multiplier');
}

// Demand ratios and the exact multiplier stack.
{
  const { sim, school, university, library } = setup();
  sim.computeStats();
  const pop = sim.stats.population;
  assert.ok(pop > 0, 'Fixture needs residents');
  assert.strictEqual(sim.stats.schoolDemand, Math.round(pop * 0.15));
  assert.strictEqual(sim.stats.universityDemand, Math.round(pop * 0.05));
  assert.strictEqual(sim.stats.educationTaxMultiplier, 1, 'No education staff gives 1.0');

  library.filledJobs = 100;
  sim.computeStats();
  assert.strictEqual(sim.stats.schoolCapacity, 0, 'Libraries do not provide student seats');
  assert.strictEqual(sim.stats.educationTaxMultiplier, 1);

  school.filledJobs = seatsJobs(sim.stats.schoolDemand);
  sim.computeStats();
  close(sim.stats.educationTaxMultiplier, 1.15, 'Full school coverage gives 1.15');

  university.filledJobs = seatsJobs(sim.stats.universityDemand);
  sim.computeStats();
  close(sim.stats.educationTaxMultiplier, 1.35, 'School + university full coverage gives 1.35');

  school.filledJobs = 1;
  university.filledJobs = 0;
  sim.computeStats();
  const partial = Math.min(1, EDUCATION_CONFIG.STUDENT_CAPACITY_PER_JOB / sim.stats.schoolDemand);
  close(sim.stats.educationTaxMultiplier, 1 + partial * 0.15, 'Partial coverage scales linearly');

  school.filledJobs = 1000;
  sim.computeStats();
  close(sim.stats.educationTaxMultiplier, 1.15, 'Excess seats are capped at full coverage');

  school.operational = false;
  sim.computeStats();
  assert.strictEqual(sim.stats.educationTaxMultiplier, 1, 'Non-operational schools provide no seats');
}

// Tax: multiplier applies before crime loss and does not change population or jobs.
{
  const { sim, home, school, university } = setup();
  home.crime = 5;
  sim.computeStats();
  const baseLoss = sim.stats.crimeTaxLoss;
  const basePop = sim.stats.population;
  const baseJobs = sim.stats.totalJobsProvided;
  assert.ok(baseLoss > 0, 'Fixture needs crime tax loss');

  school.filledJobs = seatsJobs(sim.stats.schoolDemand);
  university.filledJobs = seatsJobs(sim.stats.universityDemand);
  sim.computeStats();
  close(sim.stats.crimeTaxLoss / baseLoss, 1.35, 'Crime loss is computed from the education-boosted tax');
  assert.strictEqual(sim.stats.population, basePop, 'Education does not create residents');
  assert.strictEqual(sim.stats.totalJobsProvided, baseJobs, 'Education does not create zone jobs');
  assert.ok(sim.stats.incomePerTick > 0);
}

console.log('Education tests passed.');
