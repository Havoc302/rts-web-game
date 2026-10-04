import assert from 'assert';
import { gridDisk } from 'h3-js';
import { BIOME_TYPES, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';
import { buildClimateProfile, OverworldMap } from '../src/engine/OverworldMap.js';

const nativeAbortController = globalThis.AbortController;
if (!nativeAbortController) {
	globalThis.AbortController = class {
		constructor() { this.signal = { aborted: false }; }
		abort() { this.signal.aborted = true; }
	};
}
const THREE = await import('three');
const { OverworldView, buildGlobeBoundaries } = await import('../src/engine/OverworldView.js');

const planet = new OverworldMap(424242, 12345);
const cells = Array.from(planet.cells.values());
const land = cells.filter((cell) => !cell.ocean);
assert.strictEqual(cells.length, 842, 'Resolution-one H3 should cover the sphere with 842 connected cells');
assert.ok(land.length > 200 && land.length < 380, 'Most of the globe should be ocean');
assert.strictEqual(planet.getCell(planet.homeCellId).seed, 12345, 'The existing city is assigned to seeded land');
assert.ok(land.every((cell) => Number.isInteger(cell.seed) && Object.values(BIOME_TYPES).includes(cell.biome)));
assert.ok(land.every((cell) => Number.isFinite(cell.climate.temperatureMean) && cell.climate.weatherChances));
assert.ok(cells.filter((cell) => cell.ocean).every((cell) => !('seed' in cell) && !('biome' in cell)), 'Ocean has no city info');
const sameSeed = new OverworldMap(424242, 12345);
assert.deepStrictEqual(Array.from(sameSeed.cells.values()), cells, 'The same planet seed generates the same cells and city seeds');
assert.strictEqual(sameSeed.homeCellId, planet.homeCellId);
const differentSeed = new OverworldMap(424243, 12345);
assert.notStrictEqual(differentSeed.homeCellId, planet.homeCellId, 'The home continent should move with the world seed');
const sharedLand = land.find((cell) => cell.id !== planet.homeCellId && cell.id !== differentSeed.homeCellId && !differentSeed.getCell(cell.id).ocean);
assert.notStrictEqual(differentSeed.getCell(sharedLand.id).seed, sharedLand.seed);
assert.notDeepStrictEqual(differentSeed.getCell(sharedLand.id).climate, sharedLand.climate);
const changedCoastline = cells.filter((cell) => cell.ocean !== differentSeed.getCell(cell.id).ocean).length;
assert.ok(changedCoastline >= 8, `Changing the world seed must change continent and island geography (changed ${changedCoastline} hexes)`);
assert.ok(gridDisk(planet.homeCellId, 1).some((id) => id !== planet.homeCellId && planet.getCell(id)), 'Cells connect to neighboring hexes');
planet.setHomeSeed(98765);
assert.strictEqual(planet.getCell(planet.homeCellId).seed, 98765);
assert.ok(land.some((cell) => cell.biome === BIOME_TYPES.SWAMP));
assert.ok(land.some((cell) => cell.biome === BIOME_TYPES.MOUNTAINOUS));
for (const worldSeed of [424242, 424243, 12345, 77764, 77767]) {
	const world = new OverworldMap(worldSeed);
	const deserts = Array.from(world.cells.values()).filter((cell) => cell.biome === BIOME_TYPES.DESERT);
	assert.ok(deserts.length > 0, 'Seeded planets should include desert regions');
	assert.ok(deserts.some((cell) => gridDisk(cell.id, 1).some((id) => id !== cell.id && world.getCell(id)?.biome === BIOME_TYPES.DESERT)), 'Desert hexes should form regional groups');
	const temperate = Array.from(world.cells.values()).filter((cell) => cell.biome === BIOME_TYPES.TEMPERATE);
	assert.ok(temperate.length > 0, 'Seeded planets should include temperate regions');
	assert.ok(temperate.some((cell) => gridDisk(cell.id, 1).some((id) => id !== cell.id && world.getCell(id)?.biome === BIOME_TYPES.TEMPERATE)), 'Temperate hexes should form regional groups');
	const worldLand = Array.from(world.cells.values()).filter((cell) => !cell.ocean);
	const plains = worldLand.filter((cell) => cell.biome === BIOME_TYPES.PLAINS);
	assert.ok(plains.length >= worldLand.length * 0.1, 'Plains should remain a substantial part of the planet after adding Temperate');
	assert.ok(plains.some((cell) => gridDisk(cell.id, 1).filter((id) => id !== cell.id && world.getCell(id)?.biome === BIOME_TYPES.PLAINS).length >= 2), 'Plains should form recognizable groups instead of isolated leftover tiles');
}
const neighbors = land.flatMap((cell) => gridDisk(cell.id, 1).filter((id) => id !== cell.id && !planet.getCell(id)?.ocean).map((id) => [cell, planet.getCell(id)]));
assert.ok(neighbors.filter(([a, b]) => a.biome === b.biome).length > neighbors.length * 0.5, 'Biomes should form contiguous regions rather than random speckles');

{
	const cell = { id: 'climate-fixture', lat: 20, biome: BIOME_TYPES.TEMPERATE };
	const equator = buildClimateProfile(456, { ...cell, lat: 0 });
	const pole = buildClimateProfile(456, { ...cell, lat: 90 });
	assert.ok(equator.temperatureMean > pole.temperatureMean, 'Seeded temperature means should be warmer near the equator');
	const desertNeighbors = Array.from({ length: 3 }, (_, index) => ({ id: `desert-${index}`, lat: 20, biome: BIOME_TYPES.DESERT }));
	const temperateNeighbors = Array.from({ length: 3 }, (_, index) => ({ id: `temperate-${index}`, lat: 20, biome: BIOME_TYPES.TEMPERATE }));
	const nextToDesert = buildClimateProfile(456, cell, desertNeighbors);
	const nextToTemperate = buildClimateProfile(456, cell, temperateNeighbors);
	assert.ok(nextToDesert.temperatureMean > nextToTemperate.temperatureMean, 'Desert neighbors should nudge a temperate tile warmer');
	assert.ok(nextToDesert.weatherChances.rainy < nextToTemperate.weatherChances.rainy, 'Desert neighbors should nudge a temperate tile drier');
	assert.ok(nextToDesert.temperatureMean - nextToTemperate.temperatureMean < 4, 'Neighbor influence should remain modest');
}

{
	const before = JSON.stringify(Array.from(planet.cells.values()));
	const boundaries = buildGlobeBoundaries(planet.cells);
	assert.strictEqual(JSON.stringify(Array.from(planet.cells.values())), before, 'Rendering should not change tile IDs, seeds, biomes or saved boundaries');
	assert.strictEqual(boundaries.size, 842);
	assert.strictEqual(Array.from(boundaries.values()).filter((boundary) => boundary.length === 5).length, 12);
	assert.strictEqual(Array.from(boundaries.values()).filter((boundary) => boundary.length === 6).length, 830);
	const sharedEdges = new Map();
	for (const boundary of boundaries.values()) {
		const vertices = boundary.map(([lat, lng]) => {
			const latitude = lat * Math.PI / 180;
			const longitude = lng * Math.PI / 180;
			return new THREE.Vector3(Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude));
		});
		for (let index = 0; index < vertices.length; index++) {
			const previous = vertices[(index + vertices.length - 1) % vertices.length];
			const current = vertices[index];
			const next = vertices[(index + 1) % vertices.length];
			assert.ok(previous.clone().cross(current).dot(next) > 1e-8, 'Rendered tiles should be convex with no inward edge kinks');
			const edge = [current, next].map((vertex) => vertex.toArray().map((value) => value.toFixed(10)).join(',')).sort().join(':');
			sharedEdges.set(edge, (sharedEdges.get(edge) ?? 0) + 1);
		}
	}
	assert.ok(Array.from(sharedEdges.values()).every((count) => count === 2), 'Every rendered edge should be shared by exactly two cells without gaps');
}

{
	const visited = new Set([land.find((cell) => cell.id !== planet.homeCellId).id, cells.find((cell) => cell.ocean).id]);
	const grids = new Map([planet.homeCellId, ...visited].map((id) => [id, new Grid(8, 8, 12345)]));
	const view = Object.create(OverworldView.prototype);
	Object.assign(view, {
		planet, currentId: planet.homeCellId, isVisited: (id) => visited.has(id),
		hasCity: (id) => (grids.get(id)?.activeRoadTiles.size ?? 0) > 0,
		getTerrainStats: (id) => {
			if (!grids.has(id)) {
				const cell = planet.getCell(id);
				grids.set(id, new Grid(8, 8, cell.seed, cell.biome));
			}
			return grids.get(id).getTerrainPercentages();
		},
		cityMarkers: new THREE.Group(), cityMarkerGeometry: new THREE.CircleGeometry(0.03, 20),
		cityMarkerBorderMaterial: new THREE.MeshBasicMaterial(), cityMarkerMaterial: new THREE.MeshBasicMaterial(),
		scene: new THREE.Scene(),
	});
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 0, 'Empty current and visited maps should not have markers');
	const homeGrid = grids.get(planet.homeCellId);
	homeGrid.getTile(2, 2).terrain = TERRAIN.FLAT;
	assert.ok(homeGrid.placeRoad(2, 2));
	const oceanGrid = grids.get(cells.find((cell) => cell.ocean).id);
	oceanGrid.getTile(2, 2).terrain = TERRAIN.FLAT;
	assert.ok(oceanGrid.placeRoad(2, 2));
	view.refreshCityMarkers();
	assert.deepStrictEqual(view.cityMarkers.children.map((marker) => marker.userData.cellId), [planet.homeCellId], 'Only land maps with roads should be marked');
	const newlyVisited = land.find((cell) => cell.id !== planet.homeCellId && !visited.has(cell.id));
	visited.add(newlyVisited.id);
	const newGrid = new Grid(8, 8, 12345);
	grids.set(newlyVisited.id, newGrid);
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 1, 'Generating another map should not add a marker');
	newGrid.getTile(2, 2).terrain = TERRAIN.FLAT;
	newGrid.getTile(2, 3).terrain = TERRAIN.FLAT;
	assert.ok(newGrid.placeRoad(2, 3));
	assert.ok(newGrid.placeZone(2, 2, ZONE.RESIDENTIAL));
	assert.ok(newGrid.bulldoze(2, 3));
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 1, 'A zone without roads should not add a marker');
	newGrid.getTile(2, 3).terrain = TERRAIN.FLAT;
	assert.ok(newGrid.placeRoad(2, 3));
	newGrid.rebuildActiveTileSets();
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 2, 'Adding a road should add the map marker');
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 2, 'Refreshing markers should not duplicate them');
	for (const marker of view.cityMarkers.children) {
		assert.ok(marker.position.length() > 1.009, 'City marker should sit above the globe surface');
		assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(marker.quaternion).dot(marker.position.clone().normalize()) > 0.99,
			'City marker should face outward from the globe');
	}
	const elements = new Map();
	view.element = { querySelector: (selector) => {
		if (!elements.has(selector)) elements.set(selector, {});
		return elements.get(selector);
	} };
	for (const cell of [planet.getCell(planet.homeCellId), newlyVisited, land.find((cell) => cell.id !== planet.homeCellId && !visited.has(cell.id))]) {
		view.select(cell);
		assert.strictEqual(elements.get('#btn-enter-hex').textContent, 'Open Map');
		for (const terrain of ['water', 'forest', 'mountain']) {
			assert.match(elements.get(`#overworld-${terrain}-percent`).textContent, /^\d+\.\d%$/);
		}
	}
	assert.ok(homeGrid.bulldoze(2, 2));
	assert.ok(newGrid.bulldoze(2, 3));
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 0, 'Removing the last road should remove the marker even when zones remain');
	for (const [terrain, method] of [[TERRAIN.WATER, 'placeBridge'], [TERRAIN.MOUNTAIN, 'placeTunnel']]) {
		homeGrid.getTile(2, 2).terrain = terrain;
		assert.ok(homeGrid[method](2, 2));
		view.refreshCityMarkers();
		assert.strictEqual(view.cityMarkers.children.length, 1, 'Bridges and tunnels should count as roads');
		assert.ok(homeGrid.bulldoze(2, 2));
		view.refreshCityMarkers();
		assert.strictEqual(view.cityMarkers.children.length, 0, 'Removing the last bridge or tunnel should remove the marker');
	}
	homeGrid.getTile(2, 2).terrain = TERRAIN.FLAT;
	assert.ok(homeGrid.placeProducer(2, 2, PRODUCER_TYPE.BATTERY, 400));
	view.refreshCityMarkers();
	assert.strictEqual(view.cityMarkers.children.length, 0, 'A building alone should not mark a map without roads');
	view.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
	view.controls = { target: new THREE.Vector3(), update() {} };
	view.resize = () => {};
	view.frame = () => {};
	view.open(null);
	assert.strictEqual(view.selected, null, 'Globe startup should wait for a tile selection');
	assert.strictEqual(view.currentOutline, null, 'Startup should not highlight a placeholder current city');
	assert.strictEqual(elements.get('#btn-close-overworld').hidden, true, 'Startup should not allow returning to the mixed placeholder');
	assert.strictEqual(view.cityMarkers.children.length, 0);
	view.open(planet.homeCellId);
	assert.strictEqual(elements.get('#btn-close-overworld').hidden, false, 'Returning to a selected city should be available');
	view.cityMarkerGeometry.dispose();
	view.cityMarkerBorderMaterial.dispose();
	view.cityMarkerMaterial.dispose();
}

if (!nativeAbortController) delete globalThis.AbortController;
console.log('Overworld generation tests passed.');