import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { CrimeManager } from '../src/engine/CrimeManager.js';
import { CRIME_CONFIG, DENSITY, TERRAIN, ZONE } from '../src/config.js';

console.log('=== crime-dynamics.test.js ===');

function setupGrid() {
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) {
    for (const tile of row) tile.terrain = TERRAIN.FLAT;
  }
  return grid;
}

// 1. Vacant tiles retain a visible crime trace for five ticks.
{
  const grid = setupGrid();
  const tile = grid.getTile(2, 2);
  tile.zone = ZONE.RESIDENTIAL;
  tile.population = 0;
  tile.filledJobs = 0;
  tile.crime = 5;
  grid.activeZonedTiles.add(tile);

  const stats = { totalEmployablePopulation: 100, unemployedWorkers: 50 };
  CrimeManager.updateCrime(grid, stats);

  assert.strictEqual(tile.crime, 4, 'The first tick fades one fifth of the crime');
  for (let remaining = 3; remaining > 0; remaining--) {
    CrimeManager.updateCrime(grid, stats);
    assert.strictEqual(tile.crime, remaining, 'The crime trace fades steadily');
  }
  CrimeManager.updateCrime(grid, stats);
  assert.strictEqual(tile.crime, 0, 'The trace disappears after five ticks');
}

// 2. Demographic Isolation & Unemployment Multiplier
{
  const grid = setupGrid();
  const tile = grid.getTile(3, 3);
  tile.zone = ZONE.RESIDENTIAL;
  tile.density = DENSITY.HIGH;
  tile.population = 100; // workforce is 52
  tile.maxPopulation = 100;
  tile.crime = 0;
  grid.activeZonedTiles.add(tile);

  const origRandom = Math.random;
  try {
    // Force crime event to succeed
    Math.random = () => 0.001;
    const statsUnemployed = { totalEmployablePopulation: 100, unemployedWorkers: 100 };
    CrimeManager.updateCrime(grid, statsUnemployed);
    assert.strictEqual(tile.crime, CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT, 'Crime generates on occupied tile under unemployment pressure');
    assert.strictEqual(tile.crimeDecayTicks, CRIME_CONFIG.CRIME_MEMORY_TICKS, 'An incident starts a five-tick fade');
  } finally {
    Math.random = origRandom;
  }
}

// 3. Police Suppression
{
  const grid = setupGrid();
  const tile = grid.getTile(3, 3);
  tile.zone = ZONE.RESIDENTIAL;
  tile.population = 100;
  tile.maxPopulation = 100;
  grid.activeZonedTiles.add(tile);
  const stats = { totalEmployablePopulation: 100, unemployedWorkers: 0 };
  const origRandom = Math.random;
  try {
    Math.random = () => 0;
    CrimeManager.updateCrime(grid, stats);
    assert.strictEqual(tile.crime, CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT);
    Math.random = () => 0.99;
    for (let tick = 1; tick <= CRIME_CONFIG.CRIME_MEMORY_TICKS; tick++) {
      CrimeManager.updateCrime(grid, stats);
      assert.ok(Math.abs(tile.crime - CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT * (1 - tick / CRIME_CONFIG.CRIME_MEMORY_TICKS)) < 1e-9, 'Crime fades evenly over five ticks');
    }
    assert.strictEqual(tile.crime, 0, 'The crime overlay clears after five no-event ticks');
    Math.random = () => 0;
    CrimeManager.updateCrime(grid, stats);
    Math.random = () => 0.99;
    CrimeManager.updateCrime(grid, stats);
    Math.random = () => 0;
    CrimeManager.updateCrime(grid, stats);
    assert.strictEqual(tile.crimeDecayTicks, CRIME_CONFIG.CRIME_MEMORY_TICKS, 'Another incident restarts the fade');
  } finally {
    Math.random = origRandom;
  }
}

// 4. Police Suppression
{
  const grid = setupGrid();
  const tile = grid.getTile(4, 4);
  tile.zone = ZONE.COMMERCIAL;
  tile.density = DENSITY.HIGH;
  tile.filledJobs = 50;
  tile.maxPopulation = 100;
  tile.crime = 4;
  tile.services = { police: true };
  grid.activeZonedTiles.add(tile);

  const origRandom = Math.random;
  try {
    // Suppression check: random < 0.85 triggers suppression
    Math.random = () => 0.1;
    const stats = { totalEmployablePopulation: 100, unemployedWorkers: 50 };
    CrimeManager.updateCrime(grid, stats);
    assert.strictEqual(tile.crime, 3.2, 'Police suppression fades the incident instead of erasing it immediately');
  } finally {
    Math.random = origRandom;
  }
}

// 5. Crime Diffusion to Adjacent Occupied Tiles
{
  const grid = setupGrid();
  const neighborOccupied = grid.getTile(2, 1);
  neighborOccupied.zone = ZONE.COMMERCIAL;
  neighborOccupied.filledJobs = 10;
  neighborOccupied.crime = 0;
  grid.activeZonedTiles.add(neighborOccupied);

  const center = grid.getTile(2, 2);
  center.zone = ZONE.RESIDENTIAL;
  center.population = 50;
  center.maxPopulation = 100;
  center.crime = CRIME_CONFIG.CRIME_DIFFUSION_THRESHOLD + 1; // 5 -> fades to 4, triggering diffusion (>= 4)
  grid.activeZonedTiles.add(center);

  const neighborVacant = grid.getTile(3, 2);
  neighborVacant.zone = ZONE.RESIDENTIAL;
  neighborVacant.population = 0;
  neighborVacant.filledJobs = 0;
  neighborVacant.crime = 0;
  grid.activeZonedTiles.add(neighborVacant);

  const origRandom = Math.random;
  try {
    // Fail base probability so only decay + diffusion apply
    Math.random = () => 0.99;
    const stats = { totalEmployablePopulation: 100, unemployedWorkers: 0 };
    CrimeManager.updateCrime(grid, stats);

    assert.strictEqual(
      neighborOccupied.crime,
      CRIME_CONFIG.CRIME_DIFFUSION_INCREMENT,
      'Adjacent occupied tile receives diffused crime at full strength this tick'
    );
    assert.strictEqual(neighborOccupied.crimeDecayTicks, CRIME_CONFIG.CRIME_MEMORY_TICKS, 'Diffusion starts its own five-tick fade');
    assert.strictEqual(
      neighborVacant.crime,
      0,
      'Adjacent vacant tile ignores diffused crime'
    );
  } finally {
    Math.random = origRandom;
  }
}

console.log('Crime dynamics tests passed.');
