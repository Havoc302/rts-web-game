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

const invalid = new Grid(8, 8, 'not-a-number');
assert.ok(Number.isFinite(invalid.seed) || invalid.random() >= 0, 'Invalid seeds must still produce a PRNG stream');

console.log('Biome generation tests passed.');
