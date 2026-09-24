import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { PollutionManager } from '../src/engine/PollutionManager.js';
import { Simulation } from '../src/engine/Simulation.js';
import { deserializeGameFromJson, serializeGame } from '../src/engine/SaveGame.js';
import { DENSITY, ROAD_MAINTENANCE_COST, TERRAIN, ZONE } from '../src/config.js';

function flatten(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

function scanPollution(grid) {
  let sum = 0;
  let max = 0;
  for (const row of grid.tiles) {
    for (const tile of row) {
      const pollution = tile.pollution || 0;
      sum += pollution;
      if (pollution > max) max = pollution;
    }
  }
  const tileCount = grid.width * grid.height;
  return {
    sum,
    max,
    avg: tileCount > 0 ? Math.round((sum / tileCount) * 10) / 10 : 0,
  };
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);

  grid.placeRoad(1, 1);
  grid.placeZone(1, 2, ZONE.RESIDENTIAL);
  assert.strictEqual(grid.activeRoadTiles.size, 1, 'Placed roads should be registered');
  assert.strictEqual(grid.activeZonedTiles.size, 1, 'Placed zones should be registered');

  PollutionManager.updateIfNeeded(grid);
  assert.strictEqual(PollutionManager.updateIfNeeded(grid), false, 'Stable pollution inputs should skip recalculation');
  grid.getTile(1, 2).shortfall.sewage = true;
  assert.strictEqual(PollutionManager.updateIfNeeded(grid), true, 'Sewage shortfall changes should refresh pollution');

  grid.getTile(1, 2).onFire = true;
  grid.getTile(1, 2).fireRepair = 0.5;
  grid.rebuildActiveTileSets();
  assert.strictEqual(grid.activeFireTiles.size, 1, 'Restored fires should be registered');
  assert.strictEqual(grid.repairingTiles.size, 1, 'Restored repairs should be registered');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.placeRoad(3, 4);
  grid.placeZone(3, 3, ZONE.INDUSTRIAL);
  grid.getTile(3, 3).density = DENSITY.HIGH;

  PollutionManager.updateIfNeeded(grid);
  const scanned = scanPollution(grid);
  assert.strictEqual(grid.pollutionSum, scanned.sum, 'Cached pollution sum should match a full-grid scan after recompute');
  assert.strictEqual(grid.pollutionMax, scanned.max, 'Cached pollution max should match a full-grid scan after recompute');

  const simulation = new Simulation(grid);
  simulation.computeStats();
  assert.strictEqual(simulation.stats.maxPollution, scanned.max, 'computeStats maxPollution should use the cached aggregate');
  assert.strictEqual(simulation.stats.avgPollution, scanned.avg, 'computeStats avgPollution should use the cached aggregate');
  assert.strictEqual(simulation.stats.roadExpenses, ROAD_MAINTENANCE_COST, 'Road cost should track the adjacent access road');
  assert.strictEqual(simulation.stats.zones.industrial.high, 1, 'Zoned stats should come from the active registry');

  grid.placeRoad(1, 1);
  grid.placeRoad(1, 2);
  simulation.computeStats();
  assert.strictEqual(simulation.stats.roadExpenses, 3 * ROAD_MAINTENANCE_COST, 'Road cost should track the active road registry without a grid scan');
  PollutionManager.updateIfNeeded(grid);

  const stableSum = grid.pollutionSum;
  const stableMax = grid.pollutionMax;
  assert.strictEqual(PollutionManager.updateIfNeeded(grid), false, 'Unchanged industrial pollution inputs should skip recalculation');
  simulation.computeStats();
  assert.strictEqual(grid.pollutionSum, stableSum, 'Stable ticks should keep the cached pollution sum');
  assert.strictEqual(simulation.stats.maxPollution, stableMax, 'Stable ticks should keep the cached pollution max');

  grid.bulldoze(3, 3);
  PollutionManager.updateIfNeeded(grid);
  const afterBulldoze = scanPollution(grid);
  simulation.computeStats();
  assert.strictEqual(grid.pollutionSum, afterBulldoze.sum, 'Bulldozing the industrial source should refresh the cached pollution sum');
  assert.strictEqual(simulation.stats.maxPollution, afterBulldoze.max, 'Bulldozing the industrial source should refresh stats max pollution');
  assert.strictEqual(simulation.stats.zones.industrial.high, 0, 'Bulldozed zones should leave the active registry');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.placeRoad(2, 3);
  grid.placeZone(2, 2, ZONE.INDUSTRIAL);
  grid.getTile(2, 2).density = DENSITY.MEDIUM;
  PollutionManager.updateIfNeeded(grid);

  const beforeRebuild = { sum: grid.pollutionSum, max: grid.pollutionMax };
  grid.rebuildActiveTileSets();
  assert.strictEqual(grid.pollutionSum, beforeRebuild.sum, 'rebuildActiveTileSets should restore the same pollution sum');
  assert.strictEqual(grid.pollutionMax, beforeRebuild.max, 'rebuildActiveTileSets should restore the same pollution max');

  const simulation = new Simulation(grid);
  simulation.isPaused = true;
  const restored = deserializeGameFromJson(JSON.stringify(serializeGame({
    grid,
    simulation,
    treasury: 1000,
    activeTool: 'pan',
    autoSwitchToPan: false,
    renderer: { cameraX: 0, cameraY: 0, zoom: 1, overlayMode: 'normal' },
  })));
  assert.strictEqual(restored.grid.pollutionSum, beforeRebuild.sum, 'Save import should rebuild the cached pollution sum');
  assert.strictEqual(restored.grid.pollutionMax, beforeRebuild.max, 'Save import should rebuild the cached pollution max');

  const importedSim = new Simulation(restored.grid);
  importedSim.computeStats();
  const importedScan = scanPollution(restored.grid);
  assert.strictEqual(importedSim.stats.maxPollution, importedScan.max, 'Imported stats max pollution should match the restored tiles');
  assert.strictEqual(importedSim.stats.avgPollution, importedScan.avg, 'Imported stats average pollution should match the restored tiles');
}

console.log('Active tile registry tests passed.');