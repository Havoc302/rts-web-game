import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { BIOME_TYPES, TERRAIN, TERRAIN_GENERATION_CONFIG } from '../src/config.js';

assert.ok(TERRAIN_GENERATION_CONFIG.DEFAULT_RANDOM_SEED, 'DEFAULT_RANDOM_SEED must be defined');

function countTerrain(grid, terrain) {
  return grid.tiles.flat().filter((tile) => tile.terrain === terrain).length;
}

const seed = 424242;
const plains = new Grid(40, 40, seed, BIOME_TYPES.PLAINS);
const mountain = new Grid(40, 40, seed, BIOME_TYPES.MOUNTAINOUS);
const swamp = new Grid(40, 40, seed, BIOME_TYPES.SWAMP);

for (const citySeed of [424242, 12345, 4893875]) {
  const maps = Object.fromEntries([BIOME_TYPES.PLAINS, BIOME_TYPES.HILLY, BIOME_TYPES.MOUNTAINOUS]
    .map((biome) => [biome, new Grid(200, 200, citySeed, biome)]));
  const rockCoverage = (biome) => countTerrain(maps[biome], TERRAIN.MOUNTAIN) / 40000;
  assert.ok(rockCoverage(BIOME_TYPES.PLAINS) < 0.05, 'Plains should have little rocky terrain');
  assert.ok(rockCoverage(BIOME_TYPES.HILLY) > 0.12, 'Hilly cities should have substantial rocky terrain');
  assert.ok(rockCoverage(BIOME_TYPES.MOUNTAINOUS) > 0.3, 'Mountainous cities should be visibly mountain-dominated');
  assert.ok(rockCoverage(BIOME_TYPES.MOUNTAINOUS) > rockCoverage(BIOME_TYPES.HILLY) * 1.5);
  const desert = new Grid(200, 200, citySeed, BIOME_TYPES.DESERT);
  assert.ok(countTerrain(desert, TERRAIN.FLAT) > 40000 * 0.95, 'Deserts should be mostly open terrain');
  assert.ok(countTerrain(desert, TERRAIN.MOUNTAIN) < countTerrain(maps[BIOME_TYPES.PLAINS], TERRAIN.MOUNTAIN), 'Deserts should have fewer rocks than plains');
  assert.ok(countTerrain(desert, TERRAIN.FOREST) < 40000 * 0.02, 'Deserts should have almost no forest');
  assert.ok(countTerrain(desert, TERRAIN.WATER) > 0 && countTerrain(desert, TERRAIN.WATER) < 40000 * 0.01, 'Deserts should have sparse lake water');
  const lakeGrid = new Grid(200, 200, citySeed, BIOME_TYPES.DESERT);
  let lakeCount = 0;
  lakeGrid.paintTerrainCluster = () => { lakeCount++; };
  lakeGrid.generateLakes();
  assert.ok(lakeCount >= 1 && lakeCount <= 2, 'Deserts should generate one or two lakes');
  const beforeRiver = countTerrain(desert, TERRAIN.WATER);
  desert.generateRiver(desert.getBiomeModifiers().riverMode);
  assert.strictEqual(countTerrain(desert, TERRAIN.WATER), beforeRiver, 'Deserts should not add a river');
}

assert.ok(
  countTerrain(mountain, TERRAIN.MOUNTAIN) > countTerrain(plains, TERRAIN.MOUNTAIN),
  'Mountainous biomes should place more rock than plains',
);
assert.ok(
  countTerrain(swamp, TERRAIN.WATER) > countTerrain(plains, TERRAIN.WATER),
  'Swamp biomes should place more water than plains',
);

const directBiomeGrid = new Grid(40, 40, seed, BIOME_TYPES.PLAINS);
directBiomeGrid.generateProceduralTerrain(BIOME_TYPES.MOUNTAINOUS);
assert.strictEqual(directBiomeGrid.biome, BIOME_TYPES.MOUNTAINOUS);
assert.ok(countTerrain(directBiomeGrid, TERRAIN.MOUNTAIN) > countTerrain(plains, TERRAIN.MOUNTAIN));

for (const terrain of [TERRAIN.FOREST, TERRAIN.MOUNTAIN]) {
  const oldGrid = new Grid(40, 40, seed, null, 1);
  const shapedGrid = new Grid(40, 40, seed, null, TERRAIN_GENERATION_CONFIG.GENERATION_VERSION);
  for (const grid of [oldGrid, shapedGrid]) {
    for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    grid.random = () => 0.5;
    grid.paintTerrainCluster(20, 20, 7, terrain, 0, 0);
  }
  assert.strictEqual(oldGrid.getTile(27, 20).terrain, terrain, 'Legacy cluster retains its circular edge');
  assert.strictEqual(shapedGrid.getTile(27, 20).terrain, TERRAIN.FLAT, 'New cluster has an indentation');
  assert.strictEqual(oldGrid.getTile(20, 28).terrain, TERRAIN.FLAT);
  assert.strictEqual(shapedGrid.getTile(20, 28).terrain, terrain, 'New cluster has a protruding lobe');
}

{
  const legacy = new Grid(40, 40, seed, null, 1);
  const shaped = new Grid(40, 40, seed);
  for (const grid of [legacy, shaped]) {
    for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    grid.random = () => 0.5;
    grid.generateLakes({ lakeCountMin: 1, lakeCountMax: 1, lakeRadiusScale: 1 });
  }
  assert.strictEqual(legacy.getTile(25, 20).terrain, TERRAIN.WATER, 'Version-1 lake keeps its circular edge');
  assert.strictEqual(shaped.getTile(25, 20).terrain, TERRAIN.FLAT, 'Version-2 lake has an indentation');
  assert.strictEqual(legacy.getTile(20, 26).terrain, TERRAIN.FLAT);
  assert.strictEqual(shaped.getTile(20, 26).terrain, TERRAIN.WATER, 'Version-2 lake has a protruding lobe');
}

const invalid = new Grid(8, 8, 'not-a-number');
assert.ok(Number.isFinite(invalid.seed) || invalid.random() >= 0, 'Invalid seeds must still produce a PRNG stream');

console.log('Biome generation tests passed.');
