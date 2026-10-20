import assert from 'assert';
import {
  BIOME_TYPES,
  CLIMATE_CONFIG,
  ICE_CONFIG,
  PRODUCER_TYPE,
  TEMPERATURE_CONFIG,
  TERRAIN,
} from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';
import { buildClimateProfile, isPolarLatitude, OverworldMap } from '../src/engine/OverworldMap.js';
import { Renderer, tundraFrostCover, tundraGroundIsFrost } from '../src/engine/Renderer.js';
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

// --- Tundra cities are frozen pond country: no trees, frozen water, an open river lane ----
{
  const modifiers = new Grid(40, 40, 424242, BIOME_TYPES.TUNDRA).getBiomeModifiers();
  assert.strictEqual(modifiers.forestClusterScale, 0, 'Tundra has no forest clusters');
  assert.ok(modifiers.lakeCountMin > 0, 'Tundra should carry a lake budget');
  assert.ok(modifiers.lakeCountMax >= modifiers.lakeCountMin, 'Tundra lake budget must be a valid range');
  assert.ok(modifiers.lakeRadiusScale < 1, 'Tundra lakes should be small thermokarst ponds');
  assert.strictEqual(modifiers.riverMode, 'mixed', 'Tundra should generate a river');
  assert.strictEqual(modifiers.frozenWater, true, 'Tundra water freezes');
  assert.ok(modifiers.rockClusterScale > 0, 'Tundra still places mountains');

  const openWaterNeighbors = (grid, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .filter(([dx, dy]) => grid.getTile(x + dx, y + dy)?.terrain === TERRAIN.WATER).length;

  for (const citySeed of [424242, 12345, 4893875]) {
    const tundra = new Grid(200, 200, citySeed, BIOME_TYPES.TUNDRA);
    assert.strictEqual(countTerrain(tundra, TERRAIN.FOREST), 0, `Seed ${citySeed}: tundra cities should have no forest`);
    assert.ok(countTerrain(tundra, TERRAIN.WATER) > 0, `Seed ${citySeed}: the tundra river should keep an open lane`);
    assert.ok(countTerrain(tundra, TERRAIN.ICE) > 0, `Seed ${citySeed}: tundra lakes and river banks should freeze`);
    assert.ok(countTerrain(tundra, TERRAIN.MOUNTAIN) > 40000 * 0.1, `Seed ${citySeed}: tundra cities should still be mountainous`);
    assert.strictEqual(tundra.fireCandidateTiles.size, 0, `Seed ${citySeed}: tundra forests cannot burn because there are none`);

    // The centre of the river never freezes, so pollution keeps flowing and there is always
    // somewhere to place a Water Tower or Sewage Plant.
    for (const tile of tundra.tiles.flat()) {
      if (tile.terrain !== TERRAIN.ICE || !tile.riverFlowDir) continue;
      assert.ok(openWaterNeighbors(tundra, tile.x, tile.y) <= ICE_CONFIG.RIVER_BANK_MAX_WATER_NEIGHBORS,
        `Seed ${citySeed}: river ice at (${tile.x},${tile.y}) froze the open lane`);
    }

    // Every frozen lake is painted as ice in one pass, so a stubbed cluster painter shows the
    // terrain the lake pass asked for.
    const lakeGrid = new Grid(40, 40, citySeed, BIOME_TYPES.TUNDRA);
    const painted = [];
    lakeGrid.paintTerrainCluster = (cx, cy, radius, terrain) => painted.push(terrain);
    lakeGrid.generateLakes();
    assert.ok(painted.length >= 3, `Seed ${citySeed}: tundra cities should generate lakes`);
    assert.ok(painted.every((terrain) => terrain === TERRAIN.ICE), `Seed ${citySeed}: tundra lakes should freeze solid`);

    assert.ok(bridgesAreCrossable(tundra), `Seed ${citySeed}: bridges should cross frozen and open water alike`);
  }

  // Warm biomes keep liquid lakes and never freeze their banks.
  const temperate = new Grid(200, 200, 424242, BIOME_TYPES.TEMPERATE);
  assert.strictEqual(countTerrain(temperate, TERRAIN.ICE), 0, 'Temperate water should never freeze');
  const temperateLakes = new Grid(40, 40, 424242, BIOME_TYPES.TEMPERATE);
  const temperatePainted = [];
  temperateLakes.paintTerrainCluster = (cx, cy, radius, terrain) => temperatePainted.push(terrain);
  temperateLakes.generateLakes();
  assert.ok(temperatePainted.every((terrain) => terrain === TERRAIN.WATER), 'Temperate lakes stay liquid');
  assert.strictEqual(temperate.freezeRiverBanks(), 0, 'Freezing a warm biome should be a no-op');
}

function bridgesAreCrossable(grid) {
  const iceTile = grid.tiles.flat().find((tile) => tile.terrain === TERRAIN.ICE);
  const waterTile = grid.tiles.flat().find((tile) => tile.terrain === TERRAIN.WATER);
  const landTile = grid.tiles.flat().find((tile) => tile.terrain === TERRAIN.FLAT);
  return Boolean(
    iceTile && waterTile && landTile &&
    grid.canPlaceBridge(iceTile.x, iceTile.y) &&
    grid.canPlaceBridge(waterTile.x, waterTile.y) &&
    !grid.canPlaceBridge(landTile.x, landTile.y)
  );
}

// --- Frozen water offers no water supply and no waterfront bonus ---------------------------
{
  const grid = new Grid(6, 3, 424242, BIOME_TYPES.TUNDRA);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  grid.getTile(1, 1).terrain = TERRAIN.ICE;
  grid.getTile(4, 1).terrain = TERRAIN.WATER;

  assert.strictEqual(grid.isWaterAdjacent(1, 0), false, 'Ice is not open water');
  assert.strictEqual(grid.isWaterAdjacent(4, 0), true, 'Open water still counts as water');
  assert.strictEqual(grid.getWaterfrontStatus(1, 0), null, 'A frozen shore earns no waterfront bonus');
  assert.strictEqual(grid.getWaterfrontStatus(4, 0), 'clean', 'An unfrozen shore is a clean waterfront');
  assert.strictEqual(grid.canPlaceProducer(1, 0, PRODUCER_TYPE.WATER_TOWER), false,
    'A Water Tower cannot tap a frozen bank');
}

// --- Bare tundra ground is a soil/frost hybrid, not a snow sheet ---------------------------
{
  const painted = [];
  const makeCtx = () => new Proxy({ canvas: {}, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '' }, {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  const ctx = makeCtx();
  ctx.fillRect = () => painted.push(ctx.fillStyle);
  const flatGrid = (biome = null, size = 4) => {
    const grid = new Grid(size, size, 1, biome);
    for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    return grid;
  };
  const shades = (biome, seed = 424242) => {
    const grid = flatGrid(biome, 64);
    grid.seed = seed;
    const renderer = new Renderer({ getContext: () => makeCtx() }, grid);
    const palette = new Set();
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        painted.length = 0;
        renderer.renderTerrainTile(ctx, { terrain: TERRAIN.FLAT, x, y }, 0, 0);
        palette.add(painted[0]);
      }
    }
    return palette;
  };

  const tundraShades = shades(BIOME_TYPES.TUNDRA);
  const brightness = (hex) => hex.match(/^#(..)(..)(..)$/).slice(1).map((part) => parseInt(part, 16));
  const frosty = [...tundraShades].filter((hex) => brightness(hex).every((channel) => channel > 190));
  const soil = [...tundraShades].filter((hex) => Math.max(...brightness(hex)) < 130);
  assert.ok(frosty.length > 0, 'Tundra ground should include frost patches');
  assert.ok(soil.length > 0, 'Tundra ground should include bare soil between the frost patches');
  assert.ok(tundraShades.size >= 4, 'Frost patches and soil should both use alternating shades');

  const arcticShades = shades(BIOME_TYPES.ARCTIC);
  assert.ok([...arcticShades].every((hex) => brightness(hex).every((channel) => channel > 170)),
    'Arctic ground should stay a solid ice sheet');

  painted.length = 0;
  new Renderer({ getContext: () => makeCtx() }, flatGrid()).renderTerrainTile(ctx, { terrain: TERRAIN.FLAT, x: 0, y: 0 }, 0, 0);
  assert.strictEqual(painted[0], '#5b4636', 'Non-tundra ground should keep the existing soil colour');

  // Frost patches are deterministic per seed and tile, and cover roughly a quarter of the map.
  assert.strictEqual(tundraGroundIsFrost(424242, 7, 9), tundraGroundIsFrost(424242, 7, 9),
    'Frost patches must be stable so the cached terrain chunks do not shimmer');
  let frostTiles = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (tundraGroundIsFrost(424242, x, y)) frostTiles++;
  const frostShare = frostTiles / 40000;
  assert.ok(frostShare > 0.15 && frostShare < 0.45, `Tundra frost should cover a patchwork share, saw ${frostShare}`);
  assert.notStrictEqual(tundraFrostCover(424242, 7, 9).toFixed(6), tundraFrostCover(999, 7, 9).toFixed(6),
    'Different city seeds should scatter the patches differently');
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
