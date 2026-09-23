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

// --- 200x200 minimal-town soak fixture ---
const grid200 = new Grid(200, 200, 12345);
for (const row of grid200.tiles) {
  for (const tile of row) {
    tile.terrain = TERRAIN.FLAT;
    tile.riverFlowDir = null;
  }
}

for (let y = 1; y <= 28; y++) {
  const riverTile = grid200.getTile(1, y);
  riverTile.terrain = TERRAIN.WATER;
  riverTile.riverFlowDir = { x: 0, y: 1 };
}
for (let y = 1; y <= 28; y++) grid200.placeRoad(3, y);

assert.ok(grid200.placeProducer(2, 4, PRODUCER_TYPE.WATER_TOWER, 120), 'Water Pump should be upstream of sewage on 200x200');
assert.ok(grid200.placeProducer(2, 15, PRODUCER_TYPE.SEWAGE_PLANT, 120), 'Sewage Plant should be downstream of Water Pump on 200x200');
assert.ok(grid200.placeProducer(5, 2, PRODUCER_TYPE.BATTERY, BATTERY_CONFIG.MAX_STORAGE), 'Battery should be placed on 200x200');
assert.ok(grid200.placeProducer(4, 2, PRODUCER_TYPE.WINDMILL, 40), 'Windmill should be adjacent to battery on 200x200');
grid200.placeRoad(4, 3);
grid200.placeRoad(5, 3);

for (let y = 4; y <= 16; y++) assert.ok(grid200.placeZone(4, y, ZONE.RESIDENTIAL), 'Residential zone placed on 200x200');
for (let y = 17; y <= 24; y++) assert.ok(grid200.placeZone(4, y, ZONE.COMMERCIAL), 'Commercial zone placed on 200x200');
for (let y = 5; y <= 14; y++) assert.ok(grid200.placeZone(2, y, ZONE.AGRICULTURAL), 'Agricultural zone placed on 200x200');
for (let y = 16; y <= 20; y++) assert.ok(grid200.placeZone(2, y, ZONE.AGRICULTURAL), 'Agricultural zone placed on 200x200');
for (let y = 25; y <= 27; y++) assert.ok(grid200.placeZone(4, y, ZONE.INDUSTRIAL), 'Industrial zone placed on 200x200');

assert.strictEqual(grid200.activeZonedTiles.size, 39, '200x200 soak town should have 39 active zones');
grid200.rebuildFireCandidateTiles();

const sim200 = new Simulation(grid200);
sim200.taxRate = 20;
sim200.enableTiming = true;

Math.random = () => 0.99;
try {
  for (let tick = 1; tick <= 50; tick++) {
    sim200.tick(true, 25000);
    const { stats } = sim200;
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} must remain finite on 200x200 at tick ${tick}`);
    }
    assert.strictEqual(grid200.activeFireTiles.size, 0, `No fire should start under controlled randomness at tick ${tick}`);
    assert.ok(stats.patientDemand < 1000, `Patient demand should remain bounded at tick ${tick}`);
    assert.ok(stats.population >= 0 && stats.population <= 6500, `Population should remain within residential capacity at tick ${tick}`);
  }
} finally {
  Math.random = previousRandom;
}

assert.strictEqual(grid200.getTile(2, 4).producer.contaminated, false, 'Upstream Water Pump on 200x200 should remain uncontaminated');
assert.strictEqual(sim200.tickCount, 50, '200x200 soak simulation should advance exactly 50 ticks');

console.log('Small-town 50-tick soak test passed.');