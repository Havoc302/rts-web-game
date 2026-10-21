import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import { ResourceManager } from '../../src/engine/ResourceManager.js';
import { Simulation } from '../../src/engine/Simulation.js';
import { Renderer } from '../../src/engine/Renderer.js';
import { serializeGameToJson, deserializeGameFromJson } from '../../src/engine/SaveGame.js';
import { UtilityManager } from '../../src/engine/UtilityManager.js';
import {
  BIOME_TYPES,
  ORE_CONFIG,
  PRODUCER_CONFIG,
  PRODUCER_TYPE,
  RESOURCE_CONFIG,
  SERVICE_GLOBAL_CONFIG,
  TERRAIN,
} from '../../src/config.js';
import {
  ALL_EVENLY,
  RECIPES,
  SMELTER_RECIPE_IDS,
  hasInputs,
  recipeOutput,
  runRecipe,
} from '../../src/recipes.js';

console.log('=== sand-industry.case.js ===');

const FULL_EMPLOYMENT = { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 };

function flatGrid(width = 10, height = 10, seed = 7, biome = null) {
  const grid = new Grid(width, height, seed, biome);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

// --- Sand Quarry placement: road-adjacent, no survey, flat land only -------------------
{
  const grid = flatGrid();
  const config = PRODUCER_CONFIG[PRODUCER_TYPE.QUARRY_SAND];
  assert.strictEqual(config.name, 'Sand Quarry', 'The sand building should be named a quarry, not a mine');
  assert.strictEqual(config.cost, 5000);
  assert.deepStrictEqual(config.utilityUsage, { power: 1, water: 1, sewage: 1 });
  assert.strictEqual(config.jobs.light, 10);
  assert.strictEqual(config.requiresDiscoveredOre, undefined, 'Sand is everywhere and needs no surveyed deposit');

  assert.strictEqual(grid.canPlaceProducer(2, 2, PRODUCER_TYPE.QUARRY_SAND), true, 'A quarry should not need a discovered ore');
  assert.strictEqual(grid.canBuildProducer(2, 2, PRODUCER_TYPE.QUARRY_SAND), false, 'A quarry without a road should be invalid');
  assert.strictEqual(grid.canBuildTool(2, 2, 'producer_quarry_sand'), false, 'The toolbar rule should reject a roadless quarry');

  grid.placeRoad(1, 2);
  assert.strictEqual(grid.canBuildTool(2, 2, 'producer_quarry_sand'), true, 'The toolbar rule should accept a road-adjacent quarry');
  assert.ok(grid.placeProducer(2, 2, PRODUCER_TYPE.QUARRY_SAND, 0), 'Placing a road-adjacent quarry should succeed');

  grid.getTile(4, 4).terrain = TERRAIN.WATER;
  assert.strictEqual(grid.canPlaceProducer(4, 4, PRODUCER_TYPE.QUARRY_SAND), false, 'A quarry should not sit on water');
  grid.getTile(5, 5).terrain = TERRAIN.MOUNTAIN;
  assert.strictEqual(grid.canPlaceProducer(5, 5, PRODUCER_TYPE.QUARRY_SAND), false, 'A quarry should not sit on mountain rock');
}

// --- Every ore mine shares one rule set; sand is the only exception --------------------
{
  const mineTypes = [
    [PRODUCER_TYPE.MINE_IRON, 'iron_ore'],
    [PRODUCER_TYPE.MINE_BAUXITE, 'bauxite'],
    [PRODUCER_TYPE.MINE_COAL, 'coal'],
    [PRODUCER_TYPE.MINE_URANIUM, 'uranium'],
    [PRODUCER_TYPE.MINE_COPPER, 'copper'],
    [PRODUCER_TYPE.MINE_TITANIUM, 'titanium'],
  ];
  for (const [type, ore] of mineTypes) {
    const config = PRODUCER_CONFIG[type];
    assert.ok(config, `${type} should exist`);
    assert.strictEqual(config.category, 'resource');
    assert.strictEqual(config.requiresDiscoveredOre, ore, `${type} should need its own surveyed deposit`);
    assert.strictEqual(config.jobs.light, 10, `${type} should employ the same crew`);
    assert.ok(config.utilityUsage.power > 0 && config.utilityUsage.water > 0 && config.utilityUsage.sewage > 0, `${type} should draw utilities`);

    const grid = flatGrid();
    grid.placeRoad(1, 2);
    assert.strictEqual(grid.canBuildProducer(2, 2, type), false, `${type} should need a discovered deposit`);
    grid.getTile(2, 2).oreDiscovered = true;
    grid.getTile(2, 2).discoveredOre = ore;
    assert.strictEqual(grid.canBuildProducer(2, 2, type), true, `${type} should be placeable beside a road on its deposit`);

    const mine = grid.placeProducer(2, 2, type, 0);
    mine.operational = true;
    mine.filledJobs = 10;
    const manager = new ResourceManager();
    manager.extractFromMines(grid);
    const produced = Object.entries(manager.stockpile).filter(([, value]) => value > 0);
    assert.strictEqual(produced.length, 1, `${type} should produce exactly one resource`);
    assert.strictEqual(
      produced[0][1],
      RESOURCE_CONFIG.MINE_EXTRACTION_PER_JOB * 10,
      `${type} should extract at the shared per-job rate`,
    );
  }
}

// --- Copper and titanium are real surveyable ores --------------------------------------
{
  assert.ok(ORE_CONFIG.copper, 'Copper should be a discoverable ore');
  assert.ok(ORE_CONFIG.titanium, 'Titanium should be a discoverable ore');
  const weights = Object.values(ORE_CONFIG).map((entry) => entry.spawnWeight);
  assert.ok(weights.every((weight) => typeof weight === 'number' && weight > 0), 'Every ore should carry a spawn weight');
  assert.strictEqual(Math.min(...weights), ORE_CONFIG.titanium.spawnWeight, 'Titanium should be the rarest ore');

  const grid = new Grid(120, 120, 4242);
  const counts = {};
  for (const row of grid.tiles) {
    for (const tile of row) {
      if (!tile.ore) continue;
      counts[tile.ore] = (counts[tile.ore] || 0) + 1;
    }
  }
  const found = Object.keys(counts);
  assert.ok(found.length >= 5, `Weighted generation should produce a spread of ores, saw ${found.join(', ')}`);
  assert.ok(counts.titanium > 0, 'Titanium should still be findable on a large map');
  assert.ok(counts.iron_ore > counts.titanium, 'Iron should be far more common than titanium');
}

// --- Central recipe table --------------------------------------------------------------
{
  assert.strictEqual(SMELTER_RECIPE_IDS.length, 6, 'The smelter should offer iron, bauxite, steel, copper, glass and polysilicon');

  const steel = new ResourceManager();
  steel.stockpile.ironOre = 1;
  steel.stockpile.coal = 1;
  assert.strictEqual(runRecipe(RECIPES.STEEL, 5, steel.stockpile), 1, 'One iron ore and one coal should make exactly one steel');
  assert.strictEqual(steel.stockpile.ironOre, 0);
  assert.strictEqual(steel.stockpile.coal, 0);
  assert.strictEqual(steel.stockpile.steel, 1);

  const copper = new ResourceManager();
  copper.stockpile.copperOre = 10;
  copper.stockpile.coal = 0;
  assert.strictEqual(runRecipe(RECIPES.COPPER_BAR, 10, copper.stockpile), 2, 'Copper bars are a 1:1 conversion capped by the crew');
  assert.strictEqual(copper.stockpile.copperOre, 8);
  assert.strictEqual(copper.stockpile.copperBar, 2);

  const poly = new ResourceManager();
  poly.stockpile.sand = 10;
  poly.stockpile.coal = 0;
  assert.strictEqual(runRecipe(RECIPES.POLYSILICON, 10, poly.stockpile), 2, 'Polysilicon should be a 1:1 sand conversion');
  assert.strictEqual(poly.stockpile.polysilicon, 2);
  assert.strictEqual(poly.stockpile.glass, 0, 'Polysilicon production should not also make glass');

  // Coal is coking coal, not general fuel: only the iron and steel reactions consume it.
  // The smelter's actual energy comes from the power grid via its utilityUsage.power.
  const coalRecipes = Object.entries(RECIPES).filter(([, recipe]) => recipe.inputs.coal > 0).map(([id]) => id).sort();
  assert.deepStrictEqual(coalRecipes, ['IRON_BAR', 'STEEL'], 'Only iron bars and steel should burn coking coal');
  assert.strictEqual(PRODUCER_CONFIG[PRODUCER_TYPE.SMELTER].utilityUsage.power, 3, 'The smelter should draw grid power to run');

  // Bauxite is an electrolytic reduction, so it needs no coke.
  const bauxite = new ResourceManager();
  bauxite.stockpile.bauxiteOre = 10;
  bauxite.stockpile.coal = 0;
  assert.strictEqual(runRecipe(RECIPES.BAUXITE_BAR, 10, bauxite.stockpile), 2, 'Bauxite bars should smelt without any coal');
  assert.strictEqual(bauxite.stockpile.bauxiteBar, 2);
  assert.strictEqual(bauxite.stockpile.coal, 0, 'Bauxite smelting should not touch the coal stockpile');

  // Iron and steel do need it, and stall without it.
  const ironNoCoal = new ResourceManager();
  ironNoCoal.stockpile.ironOre = 100;
  ironNoCoal.stockpile.coal = 0;
  assert.strictEqual(runRecipe(RECIPES.IRON_BAR, 10, ironNoCoal.stockpile), 0, 'Iron smelting should stop without coking coal');
  const steelNoCoal = new ResourceManager();
  steelNoCoal.stockpile.ironOre = 100;
  steelNoCoal.stockpile.coal = 0;
  assert.strictEqual(runRecipe(RECIPES.STEEL, 10, steelNoCoal.stockpile), 0, 'Steel making should stop without coking coal');

  const glass = new ResourceManager();
  glass.stockpile.sand = 10;
  assert.strictEqual(runRecipe(RECIPES.GLASS, 10, glass.stockpile), 2, 'Glass should still be smelted from sand');
  assert.strictEqual(glass.stockpile.glass, 2);

  for (const [id, recipe] of Object.entries(RECIPES)) {
    assert.ok(recipe.output, `${id} should declare an output`);
    assert.ok(recipe.outputPerJob > 0, `${id} should declare a positive per-job rate`);
    assert.ok(recipe.label, `${id} should carry a display label`);
  }

  assert.strictEqual(recipeOutput(RECIPES.FOOD, 0, {}), 0, 'No crew means no output');
  assert.ok(recipeOutput(RECIPES.FOOD, 10, {}) > 0, 'A crew-only recipe should run with no inputs');
}

// --- Smelter recipe selection -----------------------------------------------------------
{
  const grid = flatGrid();
  const smelter = grid.placeProducer(2, 2, PRODUCER_TYPE.SMELTER, 0);
  smelter.operational = true;
  smelter.filledJobs = 10;
  const manager = new ResourceManager();

  assert.strictEqual(smelter.recipe, null, 'A fresh smelter has no recipe set, meaning All Evenly');
  manager.stockpile.sand = 100;
  manager.stockpile.coal = 100;
  manager.smelt(grid);
  assert.ok(manager.stockpile.glass > 0 && manager.stockpile.polysilicon > 0, 'All Evenly should feed both sand recipes at once');

  const ironOnly = new ResourceManager();
  ironOnly.stockpile.ironOre = 100;
  ironOnly.stockpile.coal = 100;
  assert.ok(!hasInputs(RECIPES.COPPER_BAR, ironOnly.stockpile), 'Copper has no input here');
  ironOnly.smelt(grid);
  assert.ok(ironOnly.stockpile.ironBar > 0, 'Iron should still be smelted');
  assert.strictEqual(ironOnly.stockpile.copperBar, 0, 'A line with no inputs produces nothing');

  smelter.recipe = 'STEEL';
  const dedicated = new ResourceManager();
  dedicated.stockpile.ironOre = 100;
  dedicated.stockpile.coal = 100;
  dedicated.stockpile.sand = 100;
  dedicated.smelt(grid);
  assert.strictEqual(dedicated.stockpile.steel, 2, 'The whole 10-job crew should go into steel');
  assert.strictEqual(dedicated.stockpile.ironBar, 0, 'A dedicated steel smelter should not also make iron bars');
  assert.strictEqual(dedicated.stockpile.glass, 0, 'A dedicated steel smelter should not make glass');

  smelter.recipe = ALL_EVENLY;
  const evenly = new ResourceManager();
  evenly.stockpile.sand = 100;
  evenly.stockpile.coal = 0;
  evenly.smelt(grid);
  assert.ok(evenly.stockpile.glass > 0 && evenly.stockpile.polysilicon > 0, 'All Evenly should behave as the default');

  const idle = new ResourceManager();
  smelter.filledJobs = 0;
  idle.stockpile.ironOre = 100;
  idle.stockpile.coal = 100;
  idle.smelt(grid);
  assert.strictEqual(idle.stockpile.ironBar, 0, 'An unstaffed smelter should not smelt');
  smelter.filledJobs = 10;
}

// --- The smelter is powered by the grid, not by its inputs --------------------------------
{
  const grid = flatGrid();
  const smelter = grid.placeProducer(2, 2, PRODUCER_TYPE.SMELTER, 0);
  smelter.filledJobs = 10;
  smelter.operational = true;
  const manager = new ResourceManager();
  manager.stockpile.ironOre = 100;
  manager.stockpile.coal = 100;

  // A power shortfall takes the smelter offline once the grace period lapses.
  smelter.utilityShortfall = { power: true, water: false, sewage: false };
  for (let tick = 0; tick < SERVICE_GLOBAL_CONFIG.UTILITY_FAILURE_GRACE_TICKS + 1; tick++) {
    UtilityManager.updateProducerOperationalState(grid);
  }
  assert.strictEqual(smelter.operational, false, 'A smelter with no grid power should go offline');
  manager.smelt(grid);
  assert.strictEqual(manager.stockpile.ironBar, 0, 'An unpowered smelter should smelt nothing even with ore and coal on hand');
  assert.strictEqual(manager.stockpile.coal, 100, 'An unpowered smelter should not consume coking coal');

  // Restoring power brings it back.
  smelter.utilityShortfall = { power: false, water: false, sewage: false };
  UtilityManager.updateProducerOperationalState(grid);
  manager.smelt(grid);
  assert.ok(manager.stockpile.ironBar > 0, 'A powered smelter should smelt again');
}

// --- Storage tiers -----------------------------------------------------------------------
{
  const grid = flatGrid();
  grid.placeProducer(1, 1, PRODUCER_TYPE.WAREHOUSE_ORE, 0).operational = true;
  grid.placeProducer(3, 1, PRODUCER_TYPE.WAREHOUSE_BAR, 0).operational = true;
  grid.placeProducer(5, 1, PRODUCER_TYPE.WAREHOUSE_GOODS, 0).operational = true;
  const manager = new ResourceManager();
  manager.update(grid, FULL_EMPLOYMENT);
  const cap = RESOURCE_CONFIG.WAREHOUSE_CAPACITY_PER_TILE;
  assert.strictEqual(manager.capacity.ore, cap);
  assert.strictEqual(manager.capacity.bar, cap);
  assert.strictEqual(manager.capacity.goods, cap);

  const fill = (keys, value) => { for (const key of keys) manager.stockpile[key] = value; };
  fill(['ironOre', 'bauxiteOre', 'coal', 'uraniumOre', 'copperOre', 'titaniumOre', 'sand'], cap * 3);
  fill(['ironBar', 'bauxiteBar', 'copperBar', 'steel', 'glass', 'polysilicon'], cap * 3);
  manager.stockpile.computerChips = cap * 3;
  manager.clampToCapacity();

  for (const key of ['ironOre', 'bauxiteOre', 'coal', 'uraniumOre', 'copperOre', 'titaniumOre', 'sand']) {
    assert.strictEqual(manager.stockpile[key], cap, `${key} should clamp to ore warehouse capacity`);
  }
  for (const key of ['ironBar', 'bauxiteBar', 'copperBar', 'steel', 'glass', 'polysilicon']) {
    assert.strictEqual(manager.stockpile[key], cap, `${key} should clamp to bar warehouse capacity`);
  }
  assert.strictEqual(manager.stockpile.computerChips, cap, 'Computer chips should clamp against goods capacity');
}

// --- Save round trip ----------------------------------------------------------------------
{
  const grid = flatGrid(8, 8, 11);
  grid.placeRoad(1, 1);
  grid.placeProducer(2, 1, PRODUCER_TYPE.QUARRY_SAND, 0).operational = true;
  const smelter = grid.placeProducer(3, 1, PRODUCER_TYPE.SMELTER, 0);
  smelter.recipe = 'STEEL';
  const simulation = new Simulation(grid);
  simulation.isPaused = true;
  const stored = { sand: 12, glass: 7, polysilicon: 5, copperOre: 4, titaniumOre: 3, copperBar: 2, steel: 1, computerChips: 9 };
  Object.assign(simulation.resourceManager.stockpile, stored);

  const app = {
    grid,
    simulation,
    treasury: 1000,
    loanManager: { outstandingBalance: 0, loans: [], nextLoanId: 1, serialize: () => [] },
    gameOver: false,
    hasEverHadPopulation: false,
    activeTool: 'pan',
    autoSwitchToPan: false,
    renderer: { cameraX: 0, cameraY: 0, zoom: 1, overlayMode: 'normal' },
    currentCellId: null,
  };
  const first = serializeGameToJson(app);
  const restored = deserializeGameFromJson(first);
  for (const [key, value] of Object.entries(stored)) {
    assert.strictEqual(restored.simulation.stockpile[key], value, `${key} should round-trip through a save`);
  }
  assert.strictEqual(restored.grid.producers.find((p) => p.type === PRODUCER_TYPE.SMELTER).recipe, 'STEEL', 'A smelter recipe choice should round-trip');

  const olderBuild = JSON.parse(first);
  olderBuild.appVersion = '0.2.15';
  assert.throws(() => deserializeGameFromJson(JSON.stringify(olderBuild)), /written by version 0\.2\.15/, 'A save from an older build should be rejected');

  const missingKey = JSON.parse(first);
  delete missingKey.simulation.stockpile.steel;
  assert.throws(() => deserializeGameFromJson(JSON.stringify(missingKey)), /Invalid save stockpile/, 'A save missing a stockpile key should be rejected');
}

// --- Desert ground texture ----------------------------------------------------------------
{
  const painted = [];
  const makeCtx = () => new Proxy({ canvas: {}, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '' }, {
    get: (target, prop) => (prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  const ctx = makeCtx();
  ctx.fillRect = () => painted.push(ctx.fillStyle);
  const tile = { terrain: TERRAIN.FLAT, x: 0, y: 0 };

  const desertRenderer = new Renderer({ getContext: () => makeCtx() }, flatGrid(4, 4, 1, BIOME_TYPES.DESERT));
  desertRenderer.renderTerrainTile(ctx, tile, 0, 0);
  const desertGround = painted[0];

  painted.length = 0;
  const temperateRenderer = new Renderer({ getContext: () => makeCtx() }, flatGrid(4, 4, 1));
  temperateRenderer.renderTerrainTile(ctx, tile, 0, 0);
  const temperateGround = painted[0];

  assert.notStrictEqual(desertGround, temperateGround, 'Desert ground should not use the temperate soil palette');
  const rgb = desertGround.match(/^#(..)(..)(..)$/).slice(1).map((part) => parseInt(part, 16));
  assert.ok(rgb[0] > rgb[2], `Desert ground should be a warm sand tone, saw ${desertGround}`);
  assert.ok(rgb[0] > 150 && rgb[1] > 130, `Desert ground should be light rather than dark soil, saw ${desertGround}`);
  assert.strictEqual(temperateGround, '#5b4636', 'Non-desert ground should keep the existing soil colour');

  const noBiomeRenderer = new Renderer({ getContext: () => makeCtx() }, flatGrid(4, 4, 1));
  noBiomeRenderer.grid = { biome: null };
  painted.length = 0;
  noBiomeRenderer.renderTerrainTile(ctx, tile, 0, 0);
  assert.strictEqual(painted[0], '#5b4636', 'An unknown biome should fall back to the soil palette');
}

console.log('Sand industry tests passed.');
