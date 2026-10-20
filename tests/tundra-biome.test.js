import assert from 'assert';
import {
  BIOME_TYPES,
  CLIMATE_CONFIG,
  TEMPERATURE_CONFIG,
  TERRAIN,
} from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';
import { buildClimateProfile, isPolarLatitude, OverworldMap } from '../src/engine/OverworldMap.js';
import { Renderer } from '../src/engine/Renderer.js';
import { WeatherManager } from '../src/engine/WeatherManager.js';

console.log('=== tundra-biome.test.js ===');

const countTerrain = (grid, terrain) => grid.tiles.flat().filter((tile) => tile.terrain === terrain).length;

// --- Polar caps are identified by latitude, in both hemispheres --------------------------
assert.ok(Object.values(BIOME_TYPES).includes(BIOME_TYPES.TUNDRA), 'Tundra must be a registered biome');
assert.ok(CLIMATE_CONFIG.POLAR_CAP_LATITUDE > 0 && CLIMATE_CONFIG.POLAR_CAP_LATITUDE < 90,
  'The polar cap must sit below the geographic pole');
assert.strictEqual(isPolarLatitude(CLIMATE_CONFIG.POLAR_CAP_LATITUDE), true, 'The cap boundary itself is polar');
assert.strictEqual(isPolarLatitude(-(CLIMATE_CONFIG.POLAR_CAP_LATITUDE + 5)), true, 'Both poles are polar');
assert.strictEqual(isPolarLatitude(CLIMATE_CONFIG.POLAR_CAP_LATITUDE - 0.01), false, 'Just outside the cap is not polar');
assert.strictEqual(isPolarLatitude(0), false, 'The equator is not polar');

// --- Land inside a polar cap becomes Tundra, and Tundra appears nowhere else ------------
for (const worldSeed of [424242, 424243, 12345, 77764, 77767, 2185603]) {
  const world = new OverworldMap(worldSeed);
  const cells = Array.from(world.cells.values());
  const land = cells.filter((cell) => !cell.ocean);
  // The permanent Arctic cap supersedes tundra at the poles; tundra is the ring below it.
  const polarLand = land.filter((cell) => isPolarLatitude(cell.lat) && !world.arcticCapBoundary(cell.lat, cell.lng));
  assert.ok(polarLand.every((cell) => cell.biome === BIOME_TYPES.TUNDRA),
    `Seed ${worldSeed}: every polar land hex outside the Arctic cap should be Tundra`);
  assert.ok(land.every((cell) => cell.biome !== BIOME_TYPES.TUNDRA || isPolarLatitude(cell.lat)),
    `Seed ${worldSeed}: Tundra should never appear outside the polar caps`);
  assert.ok(polarLand.every((cell) => Number.isInteger(cell.seed)), 'Tundra hexes keep a city seed');
  assert.ok(cells.filter((cell) => cell.ocean).every((cell) => !('biome' in cell)),
    `Seed ${worldSeed}: the polar cap does not turn ocean into land`);
}
assert.ok(Array.from(new OverworldMap(424242).cells.values()).some((cell) => cell.biome === BIOME_TYPES.TUNDRA),
  'Seed 424242 should have tundra land inside its polar cap');

// --- The gradient falls from equator to pole and the poles end up tundra ----------------
{
  const fixture = { id: 'tundra-fixture', lat: 0, biome: BIOME_TYPES.TEMPERATE };
  const at = (lat, biome = BIOME_TYPES.TEMPERATE) => buildClimateProfile(456, { ...fixture, lat, biome }).temperatureMean;
  const bands = [0, 20, 40, 55, 65, CLIMATE_CONFIG.POLAR_CAP_LATITUDE, 85]
    .map((lat) => at(lat));
  for (let index = 1; index < bands.length; index++) {
    assert.ok(bands[index] < bands[index - 1], 'Temperature should fall steadily from the equator to the poles');
  }

  const polar = buildClimateProfile(456, { ...fixture, lat: CLIMATE_CONFIG.POLAR_CAP_LATITUDE + 4, biome: BIOME_TYPES.TUNDRA });
  const equator = buildClimateProfile(456, { ...fixture, lat: 0, biome: BIOME_TYPES.PLAINS });
  assert.ok(polar.temperatureMean < TEMPERATURE_CONFIG.FREEZING_POINT,
    `Polar cities should be freezing, saw ${polar.temperatureMean.toFixed(1)}°C`);
  assert.ok(polar.temperatureMax <= TEMPERATURE_CONFIG.FREEZING_POINT,
    'Polar precipitation should always fall as snow because even the warm end of the range is freezing');
  assert.ok(equator.temperatureMean > polar.temperatureMean, 'The equator should stay far warmer than the poles');

  const temperate = buildClimateProfile(456, { ...fixture, lat: CLIMATE_CONFIG.POLAR_CAP_LATITUDE + 4, biome: BIOME_TYPES.TEMPERATE });
  assert.ok(polar.temperatureMean < temperate.temperatureMean, 'Tundra should be colder than adjacent temperate land');
  assert.ok(polar.weatherChances.rainy < temperate.weatherChances.rainy, 'Tundra weather should be drier than temperate weather');

  const insideCap = buildClimateProfile(456, { ...fixture, lat: CLIMATE_CONFIG.POLAR_CAP_LATITUDE, biome: BIOME_TYPES.TUNDRA });
  const outsideCap = buildClimateProfile(456, { ...fixture, lat: CLIMATE_CONFIG.POLAR_CAP_LATITUDE - 1, biome: BIOME_TYPES.HILLY });
  assert.ok(insideCap.temperatureMean < outsideCap.temperatureMean, 'Crossing into the cap should drop the temperature sharply');
}

// --- Tundra cities are snow and mountains only: no forests, rivers, or lakes -------------
{
  const modifiers = new Grid(40, 40, 424242, BIOME_TYPES.TUNDRA).getBiomeModifiers();
  assert.strictEqual(modifiers.forestClusterScale, 0, 'Tundra has no forest clusters');
  assert.strictEqual(modifiers.lakeCountMin, 0, 'Tundra has no minimum lake budget');
  assert.strictEqual(modifiers.lakeCountMax, 0, 'Tundra has no lake budget');
  assert.strictEqual(modifiers.riverMode, 'none', 'Tundra never generates a river');
  assert.ok(modifiers.rockClusterScale > 0, 'Tundra still places mountains');

  for (const citySeed of [424242, 12345, 4893875]) {
    const tundra = new Grid(200, 200, citySeed, BIOME_TYPES.TUNDRA);
    assert.strictEqual(countTerrain(tundra, TERRAIN.FOREST), 0, `Seed ${citySeed}: tundra cities should have no forest`);
    assert.strictEqual(countTerrain(tundra, TERRAIN.WATER), 0, `Seed ${citySeed}: tundra cities should have no rivers or lakes`);
    assert.ok(countTerrain(tundra, TERRAIN.MOUNTAIN) > 40000 * 0.1, `Seed ${citySeed}: tundra cities should still be mountainous`);
    assert.strictEqual(countTerrain(tundra, TERRAIN.MOUNTAIN) + countTerrain(tundra, TERRAIN.FLAT), 40000,
      `Seed ${citySeed}: tundra ground should be snow and mountains only`);
    assert.strictEqual(tundra.fireCandidateTiles.size, 0, `Seed ${citySeed}: tundra forests cannot burn because there are none`);

    const lakeGrid = new Grid(200, 200, citySeed, BIOME_TYPES.TUNDRA);
    let lakeCount = 0;
    lakeGrid.paintTerrainCluster = () => { lakeCount++; };
    lakeGrid.generateLakes();
    assert.strictEqual(lakeCount, 0, `Seed ${citySeed}: tundra cities should generate no lakes`);

    const beforeRiver = countTerrain(tundra, TERRAIN.WATER);
    tundra.generateRiver(tundra.getBiomeModifiers().riverMode);
    assert.strictEqual(countTerrain(tundra, TERRAIN.WATER), beforeRiver, `Seed ${citySeed}: tundra cities should not add a river`);
  }
}

// --- Bare tundra ground renders as snow, not soil ----------------------------------------
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

  const tundraRenderer = new Renderer({ getContext: () => makeCtx() }, flatGrid(BIOME_TYPES.TUNDRA));
  tundraRenderer.renderTerrainTile(ctx, tile, 0, 0);
  const snow = painted[0];

  painted.length = 0;
  new Renderer({ getContext: () => makeCtx() }, flatGrid()).renderTerrainTile(ctx, tile, 0, 0);
  assert.notStrictEqual(snow, painted[0], 'Tundra ground should not use the temperate soil palette');
  assert.strictEqual(painted[0], '#5b4636', 'Non-tundra ground should keep the existing soil colour');

  const rgb = snow.match(/^#(..)(..)(..)$/).slice(1).map((part) => parseInt(part, 16));
  assert.ok(rgb.every((channel) => channel > 200), `Tundra ground should be snowy white, saw ${snow}`);
}

// --- Freezing cities report snow instead of rain -----------------------------------------
{
  const wm = new WeatherManager({
    temperatureMean: -30,
    temperatureStdDev: 4,
    temperatureMin: -55,
    temperatureMax: -15,
    weatherChances: { sunny: 0.5, cloudy: 0.3, rainy: 0.2 },
  });
  wm.temperature = -30;
  wm.windIntensity = 0.1;
  wm.cloudCover = 0.2;
  assert.strictEqual(wm.isSnowing(), false, 'Clear polar skies are not snowing');
  assert.strictEqual(wm.getWeatherLabel(), 'Sunny, Calm');

  wm.cloudCover = 0.5;
  wm.windIntensity = 0.5;
  assert.strictEqual(wm.getWeatherLabel(), 'Cloudy, Breezy');

  wm.cloudCover = 0.9;
  wm.windIntensity = 0.95;
  assert.strictEqual(wm.isSnowing(), true, 'Freezing precipitation is snow');
  assert.strictEqual(wm.getWeatherLabel(), 'Snowing, Gale Force');

  wm.temperature = 5;
  assert.strictEqual(wm.isSnowing(), false, 'Precipitation above freezing stays rain');
  assert.strictEqual(wm.getWeatherLabel(), 'Raining, Gale Force');
}

console.log('Tundra biome tests passed.');
