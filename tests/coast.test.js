import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { OverworldMap } from '../src/engine/OverworldMap.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { PollutionManager } from '../src/engine/PollutionManager.js';
import {
  BIOME_TYPES,
  COAST_CONFIG,
  COAST_DIRECTIONS,
  DESALINATION_CONFIG,
  DESALINATION_OPERATING_COST,
  DENSITY,
  PRODUCER_CONFIG,
  PRODUCER_TYPE,
  TERRAIN,
  ZONE,
  getProducerUtilityUsage,
  isTieredProducer,
} from '../src/config.js';

console.log('=== coast.test.js ===');

const countTerrain = (grid, terrain) => grid.tiles.flat().filter((tile) => tile.terrain === terrain).length;

function flatGrid(width = 20, height = 6) {
  const grid = new Grid(width, height, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

// --- Overworld: which hex edges face the sea ---------------------------------------------
{
  const world = new OverworldMap(424242);
  const cells = Array.from(world.cells.values());
  const land = cells.filter((cell) => !cell.ocean);
  assert.ok(land.length > 0, 'The planet should have land');

  for (const cell of land.slice(0, 200)) {
    const directions = world.getOceanFacingDirections(cell.id);
    assert.ok(directions.every((direction) => COAST_DIRECTIONS.includes(direction)),
      'Only the six canonical hex edges may face the sea');
    assert.deepStrictEqual(directions, COAST_DIRECTIONS.filter((d) => directions.includes(d)),
      'Directions come back in canonical clockwise order without duplicates');
    assert.ok(directions.length <= COAST_DIRECTIONS.length);
  }

  const coastalCells = land.filter((cell) => world.getOceanFacingDirections(cell.id).length > 0);
  const inlandCells = land.filter((cell) => world.getOceanFacingDirections(cell.id).length === 0);
  assert.ok(coastalCells.length > 0, 'A planet with continents should have coastal land');
  assert.ok(inlandCells.length > coastalCells.length, 'Most land should be inland, not coastal');

  const islands = land.filter((cell) => world.getOceanFacingDirections(cell.id).length === COAST_DIRECTIONS.length);
  assert.ok(islands.length > 0, 'One-hex islands should report all six ocean edges');
  for (const island of islands.slice(0, 5)) {
    assert.deepStrictEqual(world.getOceanFacingDirections(island.id), COAST_DIRECTIONS);
  }

  assert.deepStrictEqual(world.getOceanFacingDirections(cells.find((cell) => cell.ocean).id), [],
    'Ocean hexes have no coastline of their own');

  const sameWorld = new OverworldMap(424242);
  assert.deepStrictEqual(
    sameWorld.getOceanFacingDirections(coastalCells[0].id),
    world.getOceanFacingDirections(coastalCells[0].id),
    'Coastlines must be deterministic for a planet seed',
  );
}

// --- Tile map: salt water and beaches on the matching sides -------------------------------
{
  const landlocked = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, []);
  assert.strictEqual(countTerrain(landlocked, TERRAIN.SALT_WATER), 0, 'An inland city has no sea');
  assert.strictEqual(countTerrain(landlocked, TERRAIN.SAND), 0, 'An inland city has no beach');

  const northCoast = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, ['N']);
  const isSalt = (grid, x, y) => grid.getTile(x, y).terrain === TERRAIN.SALT_WATER;
  const isBeach = (grid, x, y) => {
    const terrain = grid.getTile(x, y).terrain;
    return terrain === TERRAIN.SAND || terrain === TERRAIN.MOUNTAIN;
  };

  assert.ok(countTerrain(northCoast, TERRAIN.SALT_WATER) > 0, 'A north coast paints salt water');
  assert.ok(countTerrain(northCoast, TERRAIN.SAND) > 0, 'A north coast paints a sand beach');
  assert.ok(isSalt(northCoast, 100, 0), 'The ocean starts at the top edge for a north-facing hex');
  assert.strictEqual(isSalt(northCoast, 100, 199), false, 'The opposite side of the map stays land');
  assert.strictEqual(isSalt(northCoast, 0, 100), false, 'Side edges stay land for a north-facing hex');

  // Depth and beach thickness are measured on a rock-free biome, so inland mountains cannot
  // be mistaken for beach rock.
  const cleanCoast = new Grid(200, 200, 424242, BIOME_TYPES.ARCTIC, 2, 3, ['N']);
  const depths = [];
  const beaches = [];
  for (let x = 0; x < 200; x++) {
    let depth = 0;
    while (depth < 100 && isSalt(cleanCoast, x, depth)) depth++;
    if (depth === 0) continue;
    depths.push(depth);
    let beach = 0;
    while (beach < 6 && isBeach(cleanCoast, x, depth + beach)) beach++;
    beaches.push(beach);
  }
  assert.ok(depths.length > 190, 'The north coast should span the whole map width');
  assert.ok(Math.min(...depths) >= COAST_CONFIG.MIN_DEPTH - COAST_CONFIG.WOBBLE - 1,
    `Ocean should be at least about ${COAST_CONFIG.MIN_DEPTH} tiles deep, saw ${Math.min(...depths)}`);
  assert.ok(Math.max(...depths) <= COAST_CONFIG.MAX_DEPTH + COAST_CONFIG.WOBBLE + 1,
    `Ocean should be at most about ${COAST_CONFIG.MAX_DEPTH} tiles deep, saw ${Math.max(...depths)}`);
  assert.ok(Math.min(...beaches) >= 1, 'Every coastline gets at least one beach tile');
  assert.ok(Math.max(...beaches) <= COAST_CONFIG.BEACH_MAX + 1,
    `Beaches should stay one or two tiles thick, saw ${Math.max(...beaches)}`);

  const southCoast = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, ['S']);
  assert.ok(isSalt(southCoast, 100, 199), 'A south-facing hex puts the sea on the bottom edge');
  assert.strictEqual(isSalt(southCoast, 100, 0), false, 'The top edge stays land for a south coast');

  const southeastCoast = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, ['SE']);
  assert.ok(isSalt(southeastCoast, 199, 199), 'A south-east hex floods its corner');
  assert.strictEqual(isSalt(southeastCoast, 0, 0), false, 'Distant corners stay land');

  // An island hex closes in from every side, leaving buildable ground in the middle.
  const island = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, [...COAST_DIRECTIONS]);
  assert.ok(isSalt(island, 100, 0), 'Island: sea on the north edge');
  assert.ok(isSalt(island, 100, 199), 'Island: sea on the south edge');
  assert.ok(isSalt(island, 0, 100), 'Island: sea on the west edge');
  assert.ok(isSalt(island, 199, 100), 'Island: sea on the east edge');
  assert.strictEqual(isSalt(island, 100, 100), false, 'Island: the middle stays land');
  assert.ok(countTerrain(island, TERRAIN.FLAT) > 40000 * 0.2, 'Islands should still be worth building on');

  // Two coasts and one coast differ, so neighbouring hexes do not share an identical map.
  const twoCoasts = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, ['N', 'SE']);
  assert.ok(countTerrain(twoCoasts, TERRAIN.SALT_WATER) > countTerrain(northCoast, TERRAIN.SALT_WATER),
    'Each extra ocean edge adds water');

  // Coasts are deterministic for the same seed and biome.
  const repeat = new Grid(200, 200, 424242, BIOME_TYPES.PLAINS, 2, 3, ['N']);
  assert.deepStrictEqual(repeat.tiles.flat().map((tile) => tile.terrain), northCoast.tiles.flat().map((tile) => tile.terrain),
    'The same seed and coast list must rebuild the identical map');

  // Ice and tundra lakes are unaffected; the coast is additive.
  const tundraCoast = new Grid(200, 200, 424242, BIOME_TYPES.TUNDRA, 2, 3, ['S']);
  assert.ok(countTerrain(tundraCoast, TERRAIN.ICE) > 0, 'Coastal tundra keeps its frozen lakes');
  assert.ok(countTerrain(tundraCoast, TERRAIN.SALT_WATER) > 0, 'Coastal tundra gets an unfrozen sea');
}

// --- Placement: sand is buildable, salt water is not fresh water --------------------------
{
  const grid = flatGrid();
  grid.getTile(5, 5).terrain = TERRAIN.SALT_WATER;
  grid.getTile(2, 5).terrain = TERRAIN.SAND;

  assert.strictEqual(grid.canPlaceRoad(2, 5), true, 'Roads run along the beach');
  assert.strictEqual(grid.canPlaceRoad(5, 5), false, 'The sea is not buildable');
  assert.strictEqual(grid.canPlaceRoad(3, 5), true);
  grid.placeRoad(3, 5);
  assert.strictEqual(grid.canZone(2, 5), true, 'Zones can be laid on beach sand');

  assert.strictEqual(grid.isWaterAdjacent(4, 5), false, 'Salt water is not fresh water');
  assert.strictEqual(grid.isSaltWaterAdjacent(4, 5), true);
  assert.strictEqual(grid.canPlaceProducer(4, 5, PRODUCER_TYPE.WATER_TOWER), false,
    'A water pump cannot drink from the sea');
  assert.strictEqual(grid.canPlaceProducer(4, 5, PRODUCER_TYPE.DESALINATION_PLANT), true,
    'A desalination plant needs the sea');
  assert.strictEqual(grid.canPlaceProducer(4, 5, PRODUCER_TYPE.SEWAGE_PLANT), true,
    'Sewage can be discharged into the sea');

  grid.getTile(4, 3).terrain = TERRAIN.WATER;
  assert.strictEqual(grid.canPlaceProducer(4, 2, PRODUCER_TYPE.DESALINATION_PLANT), false,
    'A desalination plant must touch salt water, not a river');

  // Beaches are waterfront too: the sea makes residents happy.
  assert.strictEqual(grid.getWaterfrontStatus(4, 5), 'clean', 'The sea counts as a clean waterfront');
  grid.getTile(5, 5).isPolluted = true;
  assert.strictEqual(grid.getWaterfrontStatus(4, 5), 'polluted', 'A polluted sea is a polluted waterfront');
  grid.getTile(5, 5).isPolluted = false;
}

// --- Bridges: the 10 tile span limit ------------------------------------------------------
{
  const grid = flatGrid(40, 8);
  for (let x = 0; x < 40; x++) grid.getTile(x, 3).terrain = TERRAIN.WATER;

  assert.strictEqual(COAST_CONFIG.BRIDGE_MAX_TILES, 10);
  assert.strictEqual(grid.canPlaceBridge(1, 3), true, 'A bridge may cross a narrow channel');

  // Walk a bridge along the channel: the tenth tile is allowed, the eleventh is not.
  for (let x = 0; x < 10; x++) {
    const tile = grid.getTile(x, 3);
    assert.strictEqual(grid.canPlaceBridge(x, 3), true, `Bridge tile ${x + 1} should be allowed`);
    assert.strictEqual(grid.placeBridge(x, 3), true);
    assert.strictEqual(grid.bridgeRunLength(x, 3), x + 1);
  }
  assert.strictEqual(grid.canPlaceBridge(10, 3), false, 'An eleventh tile in the same run is refused');
  assert.strictEqual(grid.bridgeRunLength(10, 3), 11);

  // A second, separate crossing is fine: the limit is per run, not per map.
  const wide = flatGrid(40, 20);
  for (let y = 4; y < 8; y++) {
    for (let x = 0; x < 40; x++) wide.getTile(x, y).terrain = TERRAIN.WATER;
  }
  assert.strictEqual(wide.placeBridge(20, 4), true, 'A wide sea is still bridged from its shore');
  assert.strictEqual(wide.canPlaceBridge(20, 5), true, 'The run grows one tile at a time');

  // Salt water and frozen water are both crossable.
  const sea = flatGrid(10, 10);
  sea.getTile(5, 5).terrain = TERRAIN.SALT_WATER;
  assert.strictEqual(sea.canPlaceBridge(5, 5), true, 'Bridges cross the sea');
  sea.getTile(5, 5).terrain = TERRAIN.ICE;
  assert.strictEqual(sea.canPlaceBridge(5, 5), true, 'Bridges cross frozen water');
}

// --- Desalination Plant: shape, cost, and output-scaled power ----------------------------
{
  const config = PRODUCER_CONFIG[PRODUCER_TYPE.DESALINATION_PLANT];
  assert.strictEqual(config.cost, 10000, 'The plant costs $10,000');
  assert.strictEqual(config.capacity, 960, 'Output matches two fully upgraded pumps (480 each)');
  assert.strictEqual(isTieredProducer(PRODUCER_TYPE.DESALINATION_PLANT), false, 'There is no scaled version');
  assert.strictEqual(DESALINATION_OPERATING_COST, 6, 'Upkeep is three water pumps');

  const idle = { type: PRODUCER_TYPE.DESALINATION_PLANT, capacity: 960, usedCapacity: 0 };
  assert.deepStrictEqual(getProducerUtilityUsage(idle), { power: 0, water: 0, sewage: 0 },
    'An idle plant draws no power');

  const half = { type: PRODUCER_TYPE.DESALINATION_PLANT, capacity: 960, usedCapacity: 480 };
  assert.strictEqual(getProducerUtilityUsage(half).power, DESALINATION_CONFIG.PEAK_POWER / 2,
    'Power scales with the water produced');

  const full = { type: PRODUCER_TYPE.DESALINATION_PLANT, capacity: 960, usedCapacity: 960 };
  assert.strictEqual(getProducerUtilityUsage(full).power, DESALINATION_CONFIG.PEAK_POWER);
}

// --- Desalination Plant: always the last water provider ---------------------------------
{
  const grid = flatGrid(24, 3);
  // Roads along the bottom row connect every building.
  for (let x = 0; x < 24; x++) grid.getTile(x, 2).hasRoad = true;

  grid.getTile(1, 0).terrain = TERRAIN.SALT_WATER;
  grid.getTile(22, 0).terrain = TERRAIN.WATER;

  // The desalination plant sits right beside the housing; the pump is far away. Ordering must
  // still favour the pump.
  const desal = grid.placeProducer(1, 1, PRODUCER_TYPE.DESALINATION_PLANT);
  const pump = grid.placeProducer(22, 1, PRODUCER_TYPE.WATER_TOWER, 4);

  const housings = [];
  for (const x of [3, 4, 5]) {
    const tile = grid.getTile(x, 1);
    tile.zone = ZONE.RESIDENTIAL;
    tile.density = DENSITY.LIGHT;
    tile.population = 10;
    tile.maxPopulation = 10;
    tile.shortfall = { power: false, water: false, sewage: false };
    tile.distanceToProducer = { power: Infinity, water: Infinity, sewage: Infinity };
    grid.activeZonedTiles.add(tile);
    housings.push(tile);
  }

  UtilityManager.allocateAll(grid);

  // Each home needs 2 water; the pump only has 4, so it serves two homes and the plant picks
  // up the rest even though it is closer to all of them.
  assert.strictEqual(pump.usedCapacity, 4, 'The pump supplies first');
  assert.strictEqual(desal.usedCapacity, 2, 'The plant supplies only the shortfall');
  assert.ok(housings.every((tile) => tile.shortfall.water === false), 'Nobody is left dry');

  // With the pump removed the plant has to carry the whole load.
  grid.producers = grid.producers.filter((producer) => producer !== pump);
  grid.getTile(22, 1).producer = null;
  UtilityManager.allocateAll(grid);
  assert.strictEqual(desal.usedCapacity, 6, 'The plant covers everything the pumps cannot');
  assert.ok(getProducerUtilityUsage(desal).power > 0, 'Covering a gap costs power');

  // Fill the gap with pumps and the plant falls back to idle.
  const bigPump = grid.placeProducer(22, 1, PRODUCER_TYPE.WATER_TOWER, 120);
  UtilityManager.allocateAll(grid);
  assert.strictEqual(bigPump.usedCapacity, 6, 'The pump covers the whole city again');
  assert.strictEqual(desal.usedCapacity, 0, 'The plant stays idle when pumps are enough');
  assert.strictEqual(getProducerUtilityUsage(desal).power, 0, 'An idle plant draws no power');
}

// --- Desalination Plant: sewage in the sea contaminates it -------------------------------
{
  const grid = flatGrid(12, 3);
  for (let x = 0; x < 12; x++) grid.getTile(x, 2).hasRoad = true;
  // Both buildings sit on the same stretch of coast, so the plant drinks what the plant dumps.
  grid.getTile(6, 0).terrain = TERRAIN.SALT_WATER;

  const sewage = grid.placeProducer(5, 0, PRODUCER_TYPE.SEWAGE_PLANT);
  const desal = grid.placeProducer(7, 0, PRODUCER_TYPE.DESALINATION_PLANT);
  assert.ok(sewage && desal, 'Both plants fit on the coast');

  sewage.usedCapacity = 40;
  PollutionManager.computePollution(grid);

  assert.strictEqual(grid.getTile(6, 0).isPolluted, true, 'Discharged sewage pollutes the sea');
  assert.strictEqual(desal.contaminated, true, 'A plant drinking polluted seawater is contaminated');

  // A contaminated plant is skipped, so the city loses its water even though capacity exists.
  for (const x of [3, 4]) {
    const tile = grid.getTile(x, 1);
    tile.zone = ZONE.RESIDENTIAL;
    tile.density = DENSITY.LIGHT;
    tile.population = 10;
    tile.maxPopulation = 10;
    tile.shortfall = { power: false, water: false, sewage: false };
    tile.distanceToProducer = { power: Infinity, water: Infinity, sewage: Infinity };
    grid.activeZonedTiles.add(tile);
  }
  UtilityManager.allocateAll(grid);
  assert.strictEqual(desal.usedCapacity, 0, 'A contaminated plant delivers nothing');
  assert.ok(grid.getTile(3, 1).shortfall.water, 'Homes served only by a contaminated plant go dry');
}

console.log('Coast and desalination tests passed.');
