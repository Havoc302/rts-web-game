import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { PollutionManager } from '../src/engine/PollutionManager.js';
import { TERRAIN, ZONE } from '../src/config.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;

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

console.log('Active tile registry tests passed.');