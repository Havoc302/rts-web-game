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
