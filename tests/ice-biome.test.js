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
import { buildClimateProfile, isIceCapLatitude, OverworldMap } from '../src/engine/OverworldMap.js';
import { Renderer } from '../src/engine/Renderer.js';
import { WeatherManager } from '../src/engine/WeatherManager.js';

console.log('=== ice-biome.test.js ===');

const countTerrain = (grid, terrain) => grid.tiles.flat().filter((tile) => tile.terrain === terrain).length;

// --- The ice cap is a registered biome just poleward of the arctic cap -------------------
assert.ok(Object.values(BIOME_TYPES).includes(BIOME_TYPES.ICE), 'Ice must be a registered biome');
assert.ok(CLIMATE_CONFIG.ICE_CAP_LATITUDE > CLIMATE_CONFIG.POLAR_CAP_LATITUDE,
  'The permanent ice cap must sit poleward of the arctic cap');
assert.ok(CLIMATE_CONFIG.ICE_CAP_LATITUDE < 90, 'The ice cap must sit below the geographic pole');
assert.strictEqual(isIceCapLatitude(CLIMATE_CONFIG.ICE_CAP_LATITUDE), true, 'The cap boundary itself is ice');
assert.strictEqual(isIceCapLatitude(-(CLIMATE_CONFIG.ICE_CAP_LATITUDE + 4)), true, 'Both poles are ice');
assert.strictEqual(isIceCapLatitude(CLIMATE_CONFIG.ICE_CAP_LATITUDE - 0.01), false, 'Just outside the cap is not ice');
assert.strictEqual(isIceCapLatitude(0), false, 'The equator is not ice');

// --- Every polar cell becomes buildable ice, including frozen ocean ----------------------
for (const worldSeed of [424242, 424243, 12345, 77764, 77767, 2185603]) {
  const world = new OverworldMap(worldSeed);
  const cells = Array.from(world.cells.values());
  const iceCells = cells.filter((cell) => isIceCapLatitude(cell.lat));
  assert.ok(iceCells.length > 0, `Seed ${worldSeed}: the ice cap should cover part of the globe`);
  assert.ok(iceCells.every((cell) => cell.biome === BIOME_TYPES.ICE),
    `Seed ${worldSeed}: every cell inside the ice cap should be ice`);
  assert.ok(iceCells.every((cell) => cell.ocean === false),
    `Seed ${worldSeed}: ice is walkable ground, not ocean`);
  assert.ok(iceCells.every((cell) => Number.isInteger(cell.seed)),
    `Seed ${worldSeed}: ice hexes keep a city seed so a city can be founded`);
  assert.ok(cells.filter((cell) => !isIceCapLatitude(cell.lat)).every((cell) => cell.biome !== BIOME_TYPES.ICE),
    `Seed ${worldSeed}: ice should never appear outside the ice cap`);
  assert.ok(cells.filter((cell) => cell.ocean).every((cell) => !('biome' in cell) && !('seed' in cell)),
    `Seed ${worldSeed}: open ocean outside the cap still has no city info`);

  // Build the same planet with the ice cap switched off to prove that open polar water was
  // frozen over rather than only polar land being relabelled.
  const capLatitude = CLIMATE_CONFIG.ICE_CAP_LATITUDE;
  CLIMATE_CONFIG.ICE_CAP_LATITUDE = 90.001;
  let reference;
  try {
    reference = new OverworldMap(worldSeed);
  } finally {
    CLIMATE_CONFIG.ICE_CAP_LATITUDE = capLatitude;
  }
  const frozenOcean = iceCells.filter((cell) => reference.getCell(cell.id).ocean);
  assert.ok(frozenOcean.length > 0,
    `Seed ${worldSeed}: the ice cap should freeze polar ocean, not only polar land`);
  assert.ok(frozenOcean.every((cell) => Number.isInteger(cell.seed)), 'Frozen ocean hexes are seeded like land');
}

// --- Ice climate is freezing, windy, and overcast ----------------------------------------
{
  const ice = buildClimateProfile(456, { id: 'ice-fixture', lat: 82, biome: BIOME_TYPES.ICE });
  assert.ok(ice.temperatureMean < TEMPERATURE_CONFIG.FREEZING_POINT, 'Ice should be freezing on average');
  assert.ok(ice.temperatureMax <= TEMPERATURE_CONFIG.FREEZING_POINT,
    'Ice precipitation should always fall as snow because even the warm end of the range is freezing');
  assert.ok(ice.windMean > 0.7, `Ice should be windy on average, saw ${ice.windMean.toFixed(2)}`);
  assert.ok(ice.galeChance > 0.1, 'Ice should occasionally gust to gale force');
  assert.ok(ice.weatherChances.cloudy + ice.weatherChances.rainy > 0.9, 'Ice should be overcast almost all the time');
  assert.ok(ice.weatherChances.sunny < 0.05, 'Ice should rarely see clear skies');

  const sameLatitudePlains = buildClimateProfile(456, { id: 'plains-fixture', lat: 82, biome: BIOME_TYPES.PLAINS });
  assert.ok(ice.temperatureMean < sameLatitudePlains.temperatureMean, 'Ice should be colder than plains at the same latitude');
  assert.ok(ice.windMean > sameLatitudePlains.windMean, 'Ice should be windier than plains at the same latitude');
  assert.ok(ice.weatherChances.cloudy + ice.weatherChances.rainy > sameLatitudePlains.weatherChances.cloudy +
    sameLatitudePlains.weatherChances.rainy, 'Ice should be cloudier than plains at the same latitude');

  const fixture = { id: 'wind-fixture', lat: 74, biome: BIOME_TYPES.ARCTIC };
  const iceNeighbors = Array.from({ length: 6 }, (_, index) => ({ id: `ice-${index}`, lat: 82, biome: BIOME_TYPES.ICE }));
  const arcticNeighbors = Array.from({ length: 6 }, (_, index) => ({ id: `arctic-${index}`, lat: 74, biome: BIOME_TYPES.ARCTIC }));
  const nearIce = buildClimateProfile(456, fixture, iceNeighbors);
  const nearArctic = buildClimateProfile(456, fixture, arcticNeighbors);
  assert.ok(nearIce.windMean > nearArctic.windMean, 'Blustery ice neighbors should raise nearby windiness');
}

// --- Ice cities are flat, empty, unminable ground ----------------------------------------
{
  const modifiers = new Grid(40, 40, 424242, BIOME_TYPES.ICE).getBiomeModifiers();
  assert.strictEqual(modifiers.forestClusterScale, 0, 'Ice has no forest clusters');
  assert.strictEqual(modifiers.rockClusterScale, 0, 'Ice has no rock formations');
  assert.strictEqual(modifiers.lakeCountMin, 0, 'Ice has no minimum lake budget');
  assert.strictEqual(modifiers.lakeCountMax, 0, 'Ice has no lake budget');
  assert.strictEqual(modifiers.riverMode, 'none', 'Ice never generates a river');
  assert.strictEqual(modifiers.oreScale, 0, 'Ice has no hidden ore');

  for (const citySeed of [424242, 12345, 4893875]) {
    const ice = new Grid(200, 200, citySeed, BIOME_TYPES.ICE);
    assert.strictEqual(countTerrain(ice, TERRAIN.FOREST), 0, `Seed ${citySeed}: ice cities should have no forest`);
    assert.strictEqual(countTerrain(ice, TERRAIN.MOUNTAIN), 0, `Seed ${citySeed}: ice cities should have no mountains`);
    assert.strictEqual(countTerrain(ice, TERRAIN.WATER), 0, `Seed ${citySeed}: ice cities should have no rivers or lakes`);
    assert.strictEqual(countTerrain(ice, TERRAIN.FLAT), 40000, `Seed ${citySeed}: ice should be a single flat sheet`);
    assert.ok(ice.tiles.flat().every((tile) => tile.ore === null), `Seed ${citySeed}: ice should have no hidden ore to find`);
    assert.strictEqual(ice.fireCandidateTiles.size, 0, `Seed ${citySeed}: bare ice cannot catch fire`);

    // Buildable: roads and zones place normally on ice.
    assert.ok(ice.placeRoad(100, 100), `Seed ${citySeed}: ice should be buildable ground`);
    assert.ok(ice.placeZone(100, 101, ZONE.RESIDENTIAL), `Seed ${citySeed}: zones should place beside ice roads`);

    // Meltwater: pumps and plants work without open water, but other water-hungry
    // buildings still require a river or lake that an ice sheet does not have.
    assert.ok(ice.placeRoad(104, 104), `Seed ${citySeed}: ice roads should connect utilities`);
    assert.ok(ice.canBuildProducer(104, 105, PRODUCER_TYPE.WATER_TOWER),
      `Seed ${citySeed}: water pumps should tap ice meltwater`);
    assert.ok(ice.canBuildProducer(105, 104, PRODUCER_TYPE.SEWAGE_PLANT),
      `Seed ${citySeed}: sewage plants should tap ice meltwater`);
    assert.strictEqual(ice.canBuildProducer(105, 105, PRODUCER_TYPE.NUCLEAR_PLANT), false,
      `Seed ${citySeed}: other buildings still need open water`);
    const plains = new Grid(200, 200, citySeed, BIOME_TYPES.PLAINS);
    for (const row of plains.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    assert.strictEqual(plains.canPlaceProducer(100, 100, PRODUCER_TYPE.WATER_TOWER), false,
      `Seed ${citySeed}: dry land still requires adjacent water`);

    // Nothing to scan for: surveying is refused everywhere on the sheet.
    assert.strictEqual(ice.canSurvey(120, 120), false, `Seed ${citySeed}: ice has nothing to survey`);
    const surveyStation = ice.placeProducer(100, 102, 'survey_station');
    assert.ok(surveyStation, `Seed ${citySeed}: a survey station can still be built on ice`);
    assert.strictEqual(ice.startSurvey(120, 120), false, `Seed ${citySeed}: surveys cannot start on bare ice`);
  }
}

// --- Bare ice renders as ice, not soil or snow -------------------------------------------
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

  new Renderer({ getContext: () => makeCtx() }, flatGrid(BIOME_TYPES.ICE)).renderTerrainTile(ctx, tile, 0, 0);
  const ice = painted[0];
  painted.length = 0;
  new Renderer({ getContext: () => makeCtx() }, flatGrid(BIOME_TYPES.ARCTIC)).renderTerrainTile(ctx, tile, 0, 0);
  const arctic = painted[0];

  assert.notStrictEqual(ice, '#5b4636', 'Ice ground should not use the temperate soil palette');
  assert.notStrictEqual(ice, arctic, 'Ice should be visually distinct from arctic snow');
  const rgb = ice.match(/^#(..)(..)(..)$/).slice(1).map((part) => parseInt(part, 16));
  assert.ok(rgb[2] > rgb[0] && rgb[2] > rgb[1], `Ice should be a cool blue, saw ${ice}`);
  assert.ok(rgb.every((channel) => channel > 150), `Ice should stay pale, saw ${ice}`);
}

// --- Ice weather is windy and overcast in practice ---------------------------------------
{
  const climate = buildClimateProfile(456, { id: 'ice-weather-fixture', lat: 84, biome: BIOME_TYPES.ICE });
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
  assert.ok(peakWind > 0.9, `Ice wind should reach gale force, peaked at ${peakWind.toFixed(2)}`);
  assert.ok(galeTicks > ticks * 0.1, `Ice should be gale force often, saw ${galeTicks}/${ticks} ticks`);
  assert.ok(overcastTicks > ticks * 0.6, `Ice should stay overcast, saw ${overcastTicks}/${ticks} cloudy ticks`);
  assert.ok(peakTemperature < TEMPERATURE_CONFIG.FREEZING_POINT,
    `Ice weather should stay below freezing, peaked at ${peakTemperature.toFixed(1)}°C`);
}

console.log('Ice biome tests passed.');
