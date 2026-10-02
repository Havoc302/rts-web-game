import assert from 'assert';
import { gridDisk } from 'h3-js';
import { BIOME_TYPES } from '../src/config.js';
import { OverworldMap } from '../src/engine/OverworldMap.js';

const planet = new OverworldMap(424242, 12345);
const cells = Array.from(planet.cells.values());
const land = cells.filter((cell) => !cell.ocean);
assert.strictEqual(cells.length, 842, 'Resolution-one H3 should cover the sphere with 842 connected cells');
assert.ok(land.length > 200 && land.length < 380, 'Most of the globe should be ocean');
assert.strictEqual(planet.getCell(planet.homeCellId).seed, 12345, 'The existing city is assigned to seeded land');
assert.ok(land.every((cell) => Number.isInteger(cell.seed) && Object.values(BIOME_TYPES).includes(cell.biome)));
assert.ok(cells.filter((cell) => cell.ocean).every((cell) => !('seed' in cell) && !('biome' in cell)), 'Ocean has no city info');
const sameSeed = new OverworldMap(424242, 12345);
assert.deepStrictEqual(Array.from(sameSeed.cells.values()), cells, 'The same planet seed generates the same cells and city seeds');
assert.strictEqual(sameSeed.homeCellId, planet.homeCellId);
const differentSeed = new OverworldMap(424243, 12345);
assert.notStrictEqual(differentSeed.homeCellId, planet.homeCellId, 'The home continent should move with the world seed');
const sharedLand = land.find((cell) => cell.id !== planet.homeCellId && cell.id !== differentSeed.homeCellId && !differentSeed.getCell(cell.id).ocean);
assert.notStrictEqual(differentSeed.getCell(sharedLand.id).seed, sharedLand.seed);
const changedCoastline = cells.filter((cell) => cell.ocean !== differentSeed.getCell(cell.id).ocean).length;
assert.ok(changedCoastline >= 8, `Changing the world seed must change continent and island geography (changed ${changedCoastline} hexes)`);
assert.ok(gridDisk(planet.homeCellId, 1).some((id) => id !== planet.homeCellId && planet.getCell(id)), 'Cells connect to neighboring hexes');
planet.setHomeSeed(98765);
assert.strictEqual(planet.getCell(planet.homeCellId).seed, 98765);
assert.ok(land.some((cell) => cell.biome === BIOME_TYPES.SWAMP));
assert.ok(land.some((cell) => cell.biome === BIOME_TYPES.MOUNTAINOUS));
for (const worldSeed of [424242, 424243, 12345]) {
	const world = new OverworldMap(worldSeed);
	const deserts = Array.from(world.cells.values()).filter((cell) => cell.biome === BIOME_TYPES.DESERT);
	assert.ok(deserts.length > 0, 'Seeded planets should include desert regions');
	assert.ok(deserts.some((cell) => gridDisk(cell.id, 1).some((id) => id !== cell.id && world.getCell(id)?.biome === BIOME_TYPES.DESERT)), 'Desert hexes should form regional groups');
}
const neighbors = land.flatMap((cell) => gridDisk(cell.id, 1).filter((id) => id !== cell.id && !planet.getCell(id)?.ocean).map((id) => [cell, planet.getCell(id)]));
assert.ok(neighbors.filter(([a, b]) => a.biome === b.biome).length > neighbors.length * 0.5, 'Biomes should form contiguous regions rather than random speckles');

console.log('Overworld generation tests passed.');