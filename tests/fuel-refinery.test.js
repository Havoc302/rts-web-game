import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';
import { formatDerrickOutput } from '../src/engine/InspectorStatus.js';
import { DENSITY, ORE_TYPE, PRODUCER_TYPE, RESOURCE_CONFIG, TERRAIN, ZONE } from '../src/config.js';

{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const derrickTile = grid.getTile(2, 2);
  derrickTile.oreDiscovered = true;
  derrickTile.discoveredOre = ORE_TYPE.OIL;
  const derrick = grid.placeProducer(2, 2, PRODUCER_TYPE.OIL_DERRICK, 0);
  derrick.operational = true;
  derrick.totalJobs = 10;
  derrick.filledJobs = 10;
  grid.placeProducer(3, 3, PRODUCER_TYPE.SILO, 0);
  const manager = new ResourceManager();
  manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
  assert.ok(
    Math.abs(manager.stockpile.oil - RESOURCE_CONFIG.OIL_DERRICK_OUTPUT_PER_TICK) < 0.001,
    'A fully staffed derrick should produce about 100 oil per tick',
  );
}

// Derrick inspector explains output and where the oil goes.
{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const derrickTile = grid.getTile(2, 2);
  derrickTile.oreDiscovered = true;
  derrickTile.discoveredOre = ORE_TYPE.OIL;
  const derrick = grid.placeProducer(2, 2, PRODUCER_TYPE.OIL_DERRICK, 0);
  derrick.operational = true;
  derrick.totalJobs = 10;
  derrick.filledJobs = 10;
  const manager = new ResourceManager();

  manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
  assert.strictEqual(manager.stockpile.oil, 0, 'Without a silo, extracted oil has nowhere to go');
  assert.ok(formatDerrickOutput(derrick, manager.stockpile, manager.capacity).includes('No powered oil Silo'), 'Inspector warns when oil is being discarded');

  grid.placeProducer(3, 3, PRODUCER_TYPE.SILO, 0);
  manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
  assert.strictEqual(formatDerrickOutput(derrick, manager.stockpile, manager.capacity), '100 oil/tick (10/10 staff) → oil stored 100 / 1000');

  manager.stockpile.oil = RESOURCE_CONFIG.SILO_CAPACITY;
  assert.ok(formatDerrickOutput(derrick, manager.stockpile, manager.capacity).includes('storage full'), 'Inspector warns when the silo is full');

  derrick.operational = false;
  assert.ok(formatDerrickOutput(derrick, manager.stockpile, manager.capacity).startsWith('⚠️ Offline'), 'Inspector flags an offline derrick');
}

{
  const grid = new Grid(10, 10, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const refinery = grid.placeProducer(4, 4, PRODUCER_TYPE.REFINERY, 0);
  refinery.operational = true;
  grid.placeProducer(5, 5, PRODUCER_TYPE.SILO, 0).storageType = 'fuel';
  const manager = new ResourceManager();
  manager.stockpile.oil = 100;
  manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
  assert.ok(manager.stockpile.fuel >= 49, 'Refinery should convert oil to fuel at half rate');
  assert.ok(manager.stockpile.oil < 1, 'Refinery should consume its oil throughput');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const residential = grid.getTile(1, 1);
  residential.zone = ZONE.RESIDENTIAL;
  residential.density = DENSITY.HIGH;
  residential.growthScore = 50;
  grid.activeZonedTiles.add(residential);
  const sim = new Simulation(grid);
  sim.taxRate = 100;
  sim.computeStats();
  const withFuel = sim.stats.incomePerTick;
  sim.stats.fuelShortfall = 10;
  sim.computeStats();
  assert.ok(sim.stats.incomePerTick <= Math.round(withFuel * 0.5) + 1, 'Fuel shortfall should halve tile tax');
}

console.log('Fuel / refinery tests passed.');
