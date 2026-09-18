import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { getProducerConnectionStatus } from '../src/engine/InspectorStatus.js';
import { BATTERY_CONFIG, PRODUCER_TYPE, TERRAIN } from '../src/config.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;

const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE);
const windmill = grid.placeProducer(2, 2, PRODUCER_TYPE.WINDMILL, 40);
grid.placeRoad(3, 3);

assert.strictEqual(windmill.hasBatteryConnection, true, 'New windmills should immediately record their battery connection');
assert.deepStrictEqual(
  getProducerConnectionStatus(grid, windmill),
  { isBatteryDependent: true, isConnected: true, message: 'Connected via Battery Storage' },
  'Inspector should report a battery-adjacent windmill as connected without waiting for a tick',
);

grid.bulldoze(battery.x, battery.y);
assert.strictEqual(
  getProducerConnectionStatus(grid, windmill).message,
  'Needs adjacent Battery Storage',
  'Inspector should explain a missing battery connection',
);

console.log('Inspector producer status tests passed.');