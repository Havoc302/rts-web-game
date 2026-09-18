import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { BATTERY_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

const grid = new Grid(30, 30, 12345);
for (const row of grid.tiles) {
  for (const tile of row) {
    tile.terrain = TERRAIN.FLAT;
    tile.riverFlowDir = null;
  }
}

// River flows south: intake is upstream at y=4 and sewage discharge is downstream at y=15.
for (let y = 1; y <= 28; y++) {
  const riverTile = grid.getTile(1, y);
  riverTile.terrain = TERRAIN.WATER;
  riverTile.riverFlowDir = { x: 0, y: 1 };
}
for (let y = 1; y <= 28; y++) grid.placeRoad(3, y);

assert.ok(grid.placeProducer(2, 4, PRODUCER_TYPE.WATER_TOWER, 120), 'Water Pump should be upstream of sewage');
assert.ok(grid.placeProducer(2, 15, PRODUCER_TYPE.SEWAGE_PLANT, 120), 'Sewage Plant should be downstream of the Water Pump');
assert.ok(grid.placeProducer(5, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE), 'Battery should be placed');
assert.ok(grid.placeProducer(4, 2, PRODUCER_TYPE.WINDMILL, 40), 'Windmill should be adjacent to the battery');
grid.placeRoad(4, 3);
grid.placeRoad(5, 3);

for (let y = 4; y <= 16; y++) assert.ok(grid.placeZone(4, y, ZONE.RESIDENTIAL), 'Residential zone should be placed');
for (let y = 17; y <= 24; y++) assert.ok(grid.placeZone(4, y, ZONE.COMMERCIAL), 'Commercial zone should be placed');
for (let y = 5; y <= 14; y++) assert.ok(grid.placeZone(2, y, ZONE.AGRICULTURAL), 'Agricultural zone should be placed');
for (let y = 16; y <= 20; y++) assert.ok(grid.placeZone(2, y, ZONE.AGRICULTURAL), 'Agricultural zone should be placed');
for (let y = 25; y <= 27; y++) assert.ok(grid.placeZone(4, y, ZONE.INDUSTRIAL), 'Industrial zone should be placed');

assert.strictEqual(grid.activeZonedTiles.size, 39, 'Soak town should have the expected active zone count');
grid.rebuildFireCandidateTiles();

const simulation = new Simulation(grid);
simulation.taxRate = 20;
const previousRandom = Math.random;
Math.random = () => 0.99;

try {
  for (let tick = 1; tick <= 50; tick++) {
    simulation.tick(true, 25000);
    const { stats } = simulation;
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} must remain finite at tick ${tick}`);
    }
    assert.strictEqual(grid.activeFireTiles.size, 0, `No fire should start under controlled randomness at tick ${tick}`);
    assert.ok(stats.patientDemand < 1000, `Patient demand should remain bounded at tick ${tick}`);
    assert.ok(stats.population >= 0 && stats.population <= 6500, `Population should remain within residential capacity at tick ${tick}`);
  }
} finally {
  Math.random = previousRandom;
}

assert.strictEqual(grid.getTile(2, 4).producer.contaminated, false, 'Upstream Water Pump should remain uncontaminated');
assert.strictEqual(simulation.tickCount, 50, 'Soak simulation should advance exactly fifty ticks');

console.log('Small-town 50-tick soak test passed.');