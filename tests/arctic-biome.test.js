import assert from 'assert';
import {
  BIOME_TYPES,
  CLIMATE_CONFIG,
  PRODUCER_TYPE,
  TEMPERATURE_CONFIG,
  TERRAIN,
  ZONE,
} from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';
import { buildClimateProfile, createArcticCapBoundary, isArcticCapLatitude, OverworldMap } from '../src/engine/OverworldMap.js';
import { Renderer } from '../src/engine/Renderer.js';
import { WeatherManager } from '../src/engine/WeatherManager.js';

console.log('=== arctic-biome.test.js ===');

const countTerrain = (grid, terrain) => grid.tiles.flat().filter((tile) => tile.terrain === terrain).length;

// --- The Arctic cap is a registered biome just poleward of the tundra cap ----------------
assert.ok(Object.values(BIOME_TYPES).includes(BIOME_TYPES.ARCTIC), 'Arctic must be a registered biome');
assert.ok(CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE > CLIMATE_CONFIG.POLAR_CAP_LATITUDE,
  'The permanent Arctic cap must sit poleward of the tundra cap');
assert.ok(CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE < 90, 'The Arctic cap must sit below the geographic pole');
assert.strictEqual(isArcticCapLatitude(CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE), true, 'The cap boundary itself is Arctic');
assert.strictEqual(isArcticCapLatitude(-(CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE + 4)), true, 'Both poles are Arctic');
assert.strictEqual(isArcticCapLatitude(CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE - 0.01), false, 'Just outside the cap is not Arctic');
assert.strictEqual(isArcticCapLatitude(0), false, 'The equator is not Arctic');
assert.ok(CLIMATE_CONFIG.ARCTIC_CAP_WOBBLE > 0, 'The cap edge must be able to wobble away from a latitude line');

// --- The cap edge wobbles smoothly instead of tracing a circle of latitude ----------------
for (const worldSeed of [424242, 424243, 12345]) {
  const world = new OverworldMap(worldSeed);
  const cells = Array.from(world.cells.values());
  const arcticCells = cells.filter((cell) => cell.biome === BIOME_TYPES.ARCTIC);
  const nominalBand = cells.filter((cell) => isArcticCapLatitude(cell.lat));
  assert.ok(arcticCells.some((cell) => !isArcticCapLatitude(cell.lat)),
    `Seed ${worldSeed}: some Arctic ice should reach equatorward of the nominal cap`);
  assert.ok(nominalBand.some((cell) => cell.biome !== BIOME_TYPES.ARCTIC),
    `Seed ${worldSeed}: some cells poleward of the nominal cap should miss the wobbly coastline`);

  const coast = (planet) => Array.from(planet.cells.values())
    .filter((cell) => cell.biome === BIOME_TYPES.ARCTIC)
    .map((cell) => cell.id)
    .sort()
    .join(',');
  assert.strictEqual(coast(new OverworldMap(worldSeed)), coast(world),
    `Seed ${worldSeed}: the Arctic coastline must be deterministic for the same planet seed`);
  assert.notStrictEqual(coast(new OverworldMap(worldSeed + 1)), coast(world),
    `Seed ${worldSeed}: a different planet seed must draw a different Arctic coastline`);

  // Neighboring cells share the boundary: the wobble is smooth, not per-cell noise.
  const boundary = createArcticCapBoundary(worldSeed);
  assert.strictEqual(boundary(77.5, 10), boundary(77.6, 10.4),
    `Seed ${worldSeed}: adjacent points should agree about the cap edge`);
}

// --- Every polar cell becomes buildable Arctic ice, including frozen ocean ---------------
for (const worldSeed of [424242, 424243, 12345, 77764, 77767, 2185603]) {
  const world = new OverworldMap(worldSeed);
  const cells = Array.from(world.cells.values());
  const arcticCells = cells.filter((cell) => world.arcticCapBoundary(cell.lat, cell.lng));
  assert.ok(arcticCells.length > 0, `Seed ${worldSeed}: the Arctic cap should cover part of the globe`);
  assert.ok(arcticCells.every((cell) => cell.biome === BIOME_TYPES.ARCTIC),
    `Seed ${worldSeed}: every cell inside the cap should be Arctic`);
  assert.ok(arcticCells.every((cell) => cell.ocean === false),
    `Seed ${worldSeed}: Arctic ice is walkable ground, not ocean`);
  assert.ok(arcticCells.every((cell) => Number.isInteger(cell.seed)),
    `Seed ${worldSeed}: Arctic hexes keep a city seed so a city can be founded`);
  assert.ok(cells.filter((cell) => !world.arcticCapBoundary(cell.lat, cell.lng)).every((cell) => cell.biome !== BIOME_TYPES.ARCTIC),
    `Seed ${worldSeed}: Arctic should never appear outside the cap`);
  assert.ok(cells.filter((cell) => cell.ocean).every((cell) => !('biome' in cell) && !('seed' in cell)),
    `Seed ${worldSeed}: open ocean outside the cap still has no city info`);

  // Build the same planet with the Arctic cap switched off to prove that open polar water was
  // frozen over rather than only polar land being relabelled.
  const capLatitude = CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE;
  const capWobble = CLIMATE_CONFIG.ARCTIC_CAP_WOBBLE;
  CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE = 90.001;
  CLIMATE_CONFIG.ARCTIC_CAP_WOBBLE = 0;
  let reference;
  try {
    reference = new OverworldMap(worldSeed);
  } finally {
    CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE = capLatitude;
    CLIMATE_CONFIG.ARCTIC_CAP_WOBBLE = capWobble;
  }
  const frozenOcean = arcticCells.filter((cell) => reference.getCell(cell.id).ocean);
  assert.ok(frozenOcean.length > 0,
    `Seed ${worldSeed}: the Arctic cap should freeze polar ocean, not only polar land`);
  assert.ok(frozenOcean.every((cell) => Number.isInteger(cell.seed)), 'Frozen ocean hexes are seeded like land');
}

// --- Arctic climate is freezing, windy, and overcast -------------------------------------
{
  const arctic = buildClimateProfile(456, { id: 'arctic-fixture', lat: 82, biome: BIOME_TYPES.ARCTIC });
  assert.ok(arctic.temperatureMean < TEMPERATURE_CONFIG.FREEZING_POINT, 'Arctic should be freezing on average');
  assert.ok(arctic.temperatureMax <= TEMPERATURE_CONFIG.FREEZING_POINT,
    'Arctic precipitation should always fall as snow because even the warm end of the range is freezing');
  assert.ok(arctic.windMean > 0.7, `Arctic should be windy on average, saw ${arctic.windMean.toFixed(2)}`);
  assert.ok(arctic.galeChance > 0.1, 'Arctic should occasionally gust to gale force');
  assert.ok(arctic.weatherChances.cloudy + arctic.weatherChances.rainy > 0.9, 'Arctic should be overcast almost all the time');
  assert.ok(arctic.weatherChances.sunny < 0.05, 'Arctic should rarely see clear skies');

  const sameLatitudePlains = buildClimateProfile(456, { id: 'plains-fixture', lat: 82, biome: BIOME_TYPES.PLAINS });
  assert.ok(arctic.temperatureMean < sameLatitudePlains.temperatureMean, 'Arctic should be colder than plains at the same latitude');
  assert.ok(arctic.windMean > sameLatitudePlains.windMean, 'Arctic should be windier than plains at the same latitude');
  assert.ok(arctic.weatherChances.cloudy + arctic.weatherChances.rainy > sameLatitudePlains.weatherChances.cloudy +
    sameLatitudePlains.weatherChances.rainy, 'Arctic should be cloudier than plains at the same latitude');

  const fixture = { id: 'wind-fixture', lat: 74, biome: BIOME_TYPES.TUNDRA };
  const arcticNeighbors = Array.from({ length: 6 }, (_, index) => ({ id: `arctic-${index}`, lat: 82, biome: BIOME_TYPES.ARCTIC }));
  const tundraNeighbors = Array.from({ length: 6 }, (_, index) => ({ id: `tundra-${index}`, lat: 74, biome: BIOME_TYPES.TUNDRA }));
  const nearArctic = buildClimateProfile(456, fixture, arcticNeighbors);
  const nearTundra = buildClimateProfile(456, fixture, tundraNeighbors);
  assert.ok(nearArctic.windMean > nearTundra.windMean, 'Blustery Arctic neighbors should raise nearby windiness');
}

// --- Each Arctic hex gets its own seeded weather variation --------------------------------
{
  const world = new OverworldMap(424242);
  const arcticCells = Array.from(world.cells.values()).filter((cell) => cell.biome === BIOME_TYPES.ARCTIC);
  const distinct = (values) => new Set(values.map((value) => value.toFixed(4))).size;
  assert.ok(distinct(arcticCells.map((cell) => cell.climate.temperatureMean)) > 50,
    'Arctic hexes should vary in mean temperature');
  assert.ok(distinct(arcticCells.map((cell) => cell.climate.windMean)) > 10,
    'Arctic hexes should vary in mean wind');
  assert.ok(distinct(arcticCells.map((cell) => cell.climate.galeChance)) > 10,
    'Arctic hexes should vary in gale frequency');
  assert.ok(distinct(arcticCells.map((cell) => cell.climate.weatherChances.cloudy)) > 10,
    'Arctic hexes should vary in how overcast they are');
  for (const cell of arcticCells) {
    const chances = cell.climate.weatherChances;
    assert.ok(Math.abs(chances.sunny + chances.cloudy + chances.rainy - 1) < 1e-9,
      'Per-hex weather mix must stay normalized');
  }
}

// --- Arctic cities are flat, empty, unminable ground --------------------------------------
{
  const modifiers = new Grid(40, 40, 424242, BIOME_TYPES.ARCTIC).getBiomeModifiers();
  assert.strictEqual(modifiers.forestClusterScale, 0, 'Arctic has no forest clusters');
  assert.strictEqual(modifiers.rockClusterScale, 0, 'Arctic has no rock formations');
  assert.strictEqual(modifiers.lakeCountMin, 0, 'Arctic has no minimum lake budget');
  assert.strictEqual(modifiers.lakeCountMax, 0, 'Arctic has no lake budget');
  assert.strictEqual(modifiers.riverMode, 'none', 'Arctic never generates a river');
  assert.strictEqual(modifiers.oreScale, 0, 'Arctic has no hidden ore');

  for (const citySeed of [424242, 12345, 4893875]) {
    const arctic = new Grid(200, 200, citySeed, BIOME_TYPES.ARCTIC);
    assert.strictEqual(countTerrain(arctic, TERRAIN.FOREST), 0, `Seed ${citySeed}: Arctic cities should have no forest`);
    assert.strictEqual(countTerrain(arctic, TERRAIN.MOUNTAIN), 0, `Seed ${citySeed}: Arctic cities should have no mountains`);
    assert.strictEqual(countTerrain(arctic, TERRAIN.WATER), 0, `Seed ${citySeed}: Arctic cities should have no rivers or lakes`);
    assert.strictEqual(countTerrain(arctic, TERRAIN.FLAT), 40000, `Seed ${citySeed}: Arctic should be a single flat sheet`);
    assert.ok(arctic.tiles.flat().every((tile) => tile.ore === null), `Seed ${citySeed}: Arctic should have no hidden ore to find`);
    assert.strictEqual(arctic.fireCandidateTiles.size, 0, `Seed ${citySeed}: bare ice cannot catch fire`);

    // Buildable: roads and zones place normally on the ice.
    assert.ok(arctic.placeRoad(100, 100), `Seed ${citySeed}: Arctic should be buildable ground`);
    assert.ok(arctic.placeZone(100, 101, ZONE.RESIDENTIAL), `Seed ${citySeed}: zones should place beside Arctic roads`);

    // Meltwater: pumps and plants work without open water, but other water-hungry
    // buildings still require a river or lake that an ice sheet does not have.
    assert.ok(arctic.placeRoad(104, 104), `Seed ${citySeed}: Arctic roads should connect utilities`);
    assert.ok(arctic.canBuildProducer(104, 105, PRODUCER_TYPE.WATER_TOWER),
      `Seed ${citySeed}: water pumps should tap Arctic meltwater`);
    assert.ok(arctic.canBuildProducer(105, 104, PRODUCER_TYPE.SEWAGE_PLANT),
      `Seed ${citySeed}: sewage plants should tap Arctic meltwater`);
    assert.strictEqual(arctic.canBuildProducer(105, 105, PRODUCER_TYPE.NUCLEAR_PLANT), false,
      `Seed ${citySeed}: other buildings still need open water`);
    const plains = new Grid(200, 200, citySeed, BIOME_TYPES.PLAINS);
    for (const row of plains.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    assert.strictEqual(plains.canPlaceProducer(100, 100, PRODUCER_TYPE.WATER_TOWER), false,
      `Seed ${citySeed}: dry land still requires adjacent water`);

    // Nothing to scan for: surveying is refused everywhere on the sheet.
    assert.strictEqual(arctic.canSurvey(120, 120), false, `Seed ${citySeed}: Arctic has nothing to survey`);
    const surveyStation = arctic.placeProducer(100, 102, 'survey_station');
    assert.ok(surveyStation, `Seed ${citySeed}: a survey station can still be built on the ice`);
    assert.strictEqual(arctic.startSurvey(120, 120), false, `Seed ${citySeed}: surveys cannot start on bare ice`);
  }
}

// --- Bare Arctic ice renders as ice, not soil or tundra snow -----------------------------
{
  const painted = [];
  const makeCtx = () => new Proxy({ canvas: {}, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '' }, {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  const ctx = makeCtx();
  ctx.fillRect = () => painted.push(ctx.fillStyle);
  const flatGrid = (biome = null) => {
    const grid = new Grid(4, 4, 1, biome);
    for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    return grid;
  };
  const tile = { terrain: TERRAIN.FLAT, x: 0, y: 0 };

  new Renderer({ getContext: () => makeCtx() }, flatGrid(BIOME_TYPES.ARCTIC)).renderTerrainTile(ctx, tile, 0, 0);
  const arctic = painted[0];
  painted.length = 0;
  new Renderer({ getContext: () => makeCtx() }, flatGrid(BIOME_TYPES.TUNDRA)).renderTerrainTile(ctx, tile, 0, 0);
  const tundra = painted[0];

  assert.notStrictEqual(arctic, '#5b4636', 'Arctic ground should not use the temperate soil palette');
  assert.notStrictEqual(arctic, tundra, 'Arctic ice should be visually distinct from tundra snow');
  const rgb = arctic.match(/^#(..)(..)(..)$/).slice(1).map((part) => parseInt(part, 16));
  assert.ok(rgb[2] > rgb[0] && rgb[2] > rgb[1], `Arctic ice should be a cool blue, saw ${arctic}`);
  assert.ok(rgb.every((channel) => channel > 150), `Arctic ice should stay pale, saw ${arctic}`);
}

// --- Arctic weather is windy and overcast in practice ------------------------------------
{
  const climate = buildClimateProfile(456, { id: 'arctic-weather-fixture', lat: 84, biome: BIOME_TYPES.ARCTIC });
  const wm = new WeatherManager(climate);
  let peakWind = 0;
  let galeTicks = 0;
  let overcastTicks = 0;
  let peakTemperature = -Infinity;
  const ticks = 400;
  for (let tick = 0; tick < ticks; tick++) {
    wm.update();
    peakWind = Math.max(peakWind, wm.windIntensity);
    if (wm.windIntensity > 0.9) galeTicks++;
    if (wm.cloudCover > 0.4) overcastTicks++;
    peakTemperature = Math.max(peakTemperature, wm.temperature);
  }
  assert.ok(peakWind > 0.9, `Arctic wind should reach gale force, peaked at ${peakWind.toFixed(2)}`);
  assert.ok(galeTicks > ticks * 0.1, `Arctic should be gale force often, saw ${galeTicks}/${ticks} ticks`);
  assert.ok(overcastTicks > ticks * 0.6, `Arctic should stay overcast, saw ${overcastTicks}/${ticks} cloudy ticks`);
  assert.ok(peakTemperature < TEMPERATURE_CONFIG.FREEZING_POINT,
    `Arctic weather should stay below freezing, peaked at ${peakTemperature.toFixed(1)}°C`);
}

console.log('Arctic biome tests passed.');
