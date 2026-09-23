import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { getProducerConnectionStatus, getTileUtilityStatus, formatProducerCapacity } from '../src/engine/InspectorStatus.js';
import { Simulation } from '../src/engine/Simulation.js';
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

// Utility producer connection and status tests (Water Pump and Sewage Plant)
grid.getTile(0, 5).terrain = TERRAIN.WATER;
grid.getTile(0, 6).terrain = TERRAIN.WATER;
const waterPump = grid.placeProducer(1, 5, PRODUCER_TYPE.WATER_TOWER, 120);
const sewagePlant = grid.placeProducer(1, 6, PRODUCER_TYPE.SEWAGE_PLANT, 120);
grid.placeRoad(2, 5);
grid.placeRoad(2, 6);
grid.placeRoad(2, 4);
grid.placeRoad(2, 3);
grid.placeRoad(3, 3);

assert.deepStrictEqual(
  getProducerConnectionStatus(grid, waterPump),
  { isBatteryDependent: false, isConnected: true, message: null },
  'Road-connected Water Pump should show connected',
);
assert.deepStrictEqual(
  getProducerConnectionStatus(grid, sewagePlant),
  { isBatteryDependent: false, isConnected: true, message: null },
  'Road-connected Sewage Plant should show connected',
);

const sim = new Simulation(grid);
sim.tick();

const waterTile = grid.getTile(1, 5);
const sewageTile = grid.getTile(1, 6);

assert.strictEqual(
  getTileUtilityStatus(grid, waterTile, 'water'),
  'Produces This Utility',
  'Water Pump must show Produces This Utility for water',
);
assert.strictEqual(
  getTileUtilityStatus(grid, waterTile, 'power'),
  'Serviced',
  'Water Pump must show Serviced for power when connected to power',
);
assert.strictEqual(
  getTileUtilityStatus(grid, waterTile, 'sewage'),
  'Serviced',
  'Water Pump must show Serviced for sewage when connected to sewage plant',
);

assert.strictEqual(
  getTileUtilityStatus(grid, sewageTile, 'sewage'),
  'Produces This Utility',
  'Sewage Plant must show Produces This Utility for sewage',
);
assert.strictEqual(
  getTileUtilityStatus(grid, sewageTile, 'water'),
  'Serviced',
  'Sewage Plant must show Serviced for water when connected to water pump',
);
assert.strictEqual(
  getTileUtilityStatus(grid, sewageTile, 'power'),
  'Serviced',
  'Sewage Plant must show Serviced for power when connected to power',
);

// Producer Load / Capacity rounding to two decimal places
assert.strictEqual(
  formatProducerCapacity(waterPump),
  `${Number(waterPump.usedCapacity).toFixed(2)} / ${Number(waterPump.capacity).toFixed(2)}`,
  'Water Pump capacity should format to two decimal places',
);
waterPump.usedCapacity = 3.5;
assert.strictEqual(
  formatProducerCapacity(waterPump),
  '3.50 / 120.00',
  'Fractional usedCapacity should round to two decimal places',
);

assert.strictEqual(
  formatProducerCapacity(battery),
  `${Number(battery.usedCapacity).toFixed(2)} / ${Number(battery.capacity).toFixed(2)} (Stored: ${Number(battery.storedEnergy).toFixed(2)} / ${Number(battery.maxStorage).toFixed(2)})`,
  'Battery load, capacity, and stored energy should format to two decimal places',
);

grid.bulldoze(battery.x, battery.y);
assert.strictEqual(
  getProducerConnectionStatus(grid, windmill).message,
  'Needs adjacent Battery Storage',
  'Inspector should explain a missing battery connection',
);
assert.strictEqual(
  formatProducerCapacity(windmill, grid),
  '⚠️ Offline (Must be adjacent to Battery Storage)',
  'Disconnected windmill capacity should show offline notice',
);

console.log('Inspector producer status tests passed.');