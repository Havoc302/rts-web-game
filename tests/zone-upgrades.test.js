import assert from 'assert';
import {
  DENSITY,
  GROWTH_CONFIG,
  JOBS_PROVIDED,
  RESIDENTIAL_CAPACITY,
  ZONE,
  getZoneUpgradeCost,
  isZoneAtCapacity,
} from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';

const zones = [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.AGRICULTURAL];
const baseCosts = {
  [ZONE.RESIDENTIAL]: 200,
  [ZONE.COMMERCIAL]: 200,
  [ZONE.INDUSTRIAL]: 300,
  [ZONE.AGRICULTURAL]: 300,
};

for (const zone of zones) {
  assert.strictEqual(getZoneUpgradeCost(zone, DENSITY.LIGHT), baseCosts[zone] * 2);
  assert.strictEqual(getZoneUpgradeCost(zone, DENSITY.MEDIUM), baseCosts[zone] * 4);
  assert.strictEqual(getZoneUpgradeCost(zone, DENSITY.HIGH), 0, 'High-density zones have no further upgrade cost');
}

function makeZone(grid, x, zone, density = DENSITY.LIGHT) {
  const tile = grid.getTile(x, 1);
  tile.zone = zone;
  tile.density = density;
  grid.activeZonedTiles.add(tile);
  return tile;
}

{
  const grid = new Grid(8, 8, 1);
  const residential = makeZone(grid, 1, ZONE.RESIDENTIAL);
  residential.population = RESIDENTIAL_CAPACITY[DENSITY.LIGHT] - 1;
  assert.strictEqual(isZoneAtCapacity(residential), false);
  assert.strictEqual(grid.canUpgradeZone(residential), false);

  residential.population++;
  assert.strictEqual(isZoneAtCapacity(residential), true);
  assert.strictEqual(grid.upgradeZone(residential), true);
  assert.strictEqual(residential.density, DENSITY.MEDIUM);
  assert.strictEqual(residential.population, 25, 'Upgrading must not remove existing residents');
  assert.strictEqual(
    Math.round((residential.growthScore - GROWTH_CONFIG.THRESHOLD_MEDIUM) / (GROWTH_CONFIG.THRESHOLD_HIGH - GROWTH_CONFIG.THRESHOLD_MEDIUM) * RESIDENTIAL_CAPACITY[DENSITY.MEDIUM]),
    25,
    'Residential growth progress should preserve existing occupancy after upgrade',
  );

  residential.population = RESIDENTIAL_CAPACITY[DENSITY.MEDIUM];
  assert.strictEqual(grid.upgradeZone(residential), true);
  assert.strictEqual(residential.density, DENSITY.HIGH);
  assert.strictEqual(grid.canUpgradeZone(residential), false, 'High-density zones cannot be upgraded again');
}

for (const zone of zones.slice(1)) {
  const grid = new Grid(8, 8, 1);
  const tile = makeZone(grid, 1, zone);
  tile.totalJobs = JOBS_PROVIDED[zone][DENSITY.LIGHT];
  tile.filledJobs = tile.totalJobs - 1;
  assert.strictEqual(isZoneAtCapacity(tile), false, `${zone} should not be full with an open job slot`);
  assert.strictEqual(grid.canUpgradeZone(tile), false);
  tile.filledJobs++;
  assert.strictEqual(isZoneAtCapacity(tile), true);
  assert.strictEqual(grid.upgradeZone(tile), true);
  assert.strictEqual(tile.density, DENSITY.MEDIUM);
}

{
  const grid = new Grid(8, 8, 1);
  const residential = makeZone(grid, 1, ZONE.RESIDENTIAL, DENSITY.HIGH);
  residential.population = RESIDENTIAL_CAPACITY[DENSITY.HIGH];
  assert.strictEqual(grid.upgradeZone(residential), false, 'A high-density tile cannot advance past its final tier');
}

console.log('Zone upgrade tests passed.');