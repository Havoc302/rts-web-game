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

// 1. Vacant Tile Cleanup (double-rate decay, no crime generation)
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

  // 5 - (1 * 2) = 3
  assert.strictEqual(tile.crime, 3, 'Vacant tiles dissipate crime at 2x rate');
  CrimeManager.updateCrime(grid, stats);
  assert.strictEqual(tile.crime, 1, 'Vacant tiles continue 2x dissipation');
  CrimeManager.updateCrime(grid, stats);
  assert.strictEqual(tile.crime, 0, 'Vacant tiles drain crime to 0 floor');
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
  } finally {
    Math.random = origRandom;
  }
}

// 3. Police Suppression
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
    assert.strictEqual(tile.crime, 3, 'Police suppression actively decays existing crime');
  } finally {
    Math.random = origRandom;
  }
}

// 4. Crime Diffusion to Adjacent Occupied Tiles
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
  center.crime = CRIME_CONFIG.CRIME_DIFFUSION_THRESHOLD + 1; // 5 -> decays to 4, triggering diffusion (>= 4)
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
      'Adjacent occupied tile receives diffused crime'
    );
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
