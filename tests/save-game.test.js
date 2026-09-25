import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import {
  deserializeGame,
  deserializeGameFromJson,
  GENERATION_VERSION,
  SAVE_VERSION,
  serializeGame,
  serializeGameToJson,
  serializeGameV1,
} from '../src/engine/SaveGame.js';
import { PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

function makeApp(grid, simulation, extras = {}) {
  simulation.isPaused = true;
  return {
    grid,
    simulation,
    treasury: extras.treasury ?? 9876,
    activeTool: extras.activeTool ?? 'survey',
    autoSwitchToPan: extras.autoSwitchToPan ?? true,
    renderer: extras.renderer ?? { cameraX: 12, cameraY: -8, zoom: 1.4, overlayMode: 'survey' },
  };
}

function flatten(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

{
  const grid = new Grid(8, 8, 12345);
  flatten(grid);
  grid.placeRoad(2, 2);
  grid.placeZone(2, 1, ZONE.RESIDENTIAL);
  const battery = grid.placeProducer(4, 4, PRODUCER_TYPE.BATTERY, 400);
  battery.storedEnergy = 123;
  const simulation = new Simulation(grid);
  simulation.tickCount = 17;
  simulation.taxRate = 35;
  simulation.pensionBudget = 80;
  simulation.resourceManager.stockpile.food = 42;

  const app = makeApp(grid, simulation);
  const document = serializeGame(app);
  assert.strictEqual(document.saveVersion, SAVE_VERSION, 'New saves should use the sparse save version');
  assert.strictEqual(document.generationVersion, GENERATION_VERSION, 'New saves should record the terrain generation version');
  assert.ok(!document.grid?.tiles, 'Sparse saves should not include a full tile grid');
  assert.ok(document.tiles.length < grid.width * grid.height, 'Sparse saves should store tile overrides, not every tile');
  assert.ok(!JSON.stringify(document.tiles).includes('"ore":'), 'Hidden ore must not appear on tile overrides');

  const json = serializeGameToJson(app);
  assert.equal(json.includes('\n  '), false, 'Exported save JSON should be compact');

  const restored = deserializeGameFromJson(json);
  assert.strictEqual(restored.grid.width, 8);
  assert.strictEqual(restored.grid.getTile(2, 1).zone, ZONE.RESIDENTIAL);
  assert.strictEqual(restored.grid.producers[0].storedEnergy, 123);
  assert.strictEqual(restored.simulation.tickCount, 17);
  assert.strictEqual(restored.simulation.taxRate, 35);
  assert.strictEqual(restored.simulation.stockpile.food, 42);
  assert.strictEqual(restored.treasury, 9876);
  assert.deepStrictEqual(restored.camera, { x: 12, y: -8, zoom: 1.4 });
  assert.strictEqual(restored.ui.overlayMode, 'survey');
  assert.strictEqual(restored.ui.autoSwitchToPan, true);
  assert.strictEqual(restored.grid.getTile(4, 4).producer, restored.grid.producers[0], 'Producer tile links should be restored');
  assert.strictEqual(restored.simulation.isPaused, true, 'Loaded games must restore paused');
  assert.strictEqual(restored.simulation.speed, 0, 'Loaded games must restore speed 0');
}

{
  const grid = new Grid(8, 8, 12345);
  flatten(grid);
  grid.placeRoad(2, 2);
  const simulation = new Simulation(grid);
  const app = makeApp(grid, simulation);

  assert.throws(
    () => serializeGame({ ...app, simulation: { ...simulation, isPaused: false } }),
    /Pause the game before saving/,
    'Running games should not be saved',
  );
  assert.throws(
    () => deserializeGame({ saveVersion: SAVE_VERSION + 1 }),
    /Unsupported save version/,
    'Unknown save versions should be rejected',
  );
  assert.throws(
    () => deserializeGame({ saveVersion: SAVE_VERSION, generationVersion: GENERATION_VERSION + 1, map: { width: 8, height: 8, seed: 1, nextProducerId: 1 } }),
    /terrain generation version/,
    'Generation-version mismatches should be rejected with a clear error',
  );
  assert.throws(
    () => deserializeGameFromJson('{not json'),
    /not valid JSON/,
    'Malformed JSON should be rejected',
  );
}

{
  const grid = new Grid(8, 8, 12345);
  flatten(grid);
  grid.placeRoad(1, 1);
  grid.placeZone(1, 2, ZONE.RESIDENTIAL);
  const simulation = new Simulation(grid);
  simulation.tickCount = 4;
  simulation.speed = 2;
  const v1 = serializeGameV1(makeApp(grid, simulation, { treasury: 50 }));
  v1.simulation.isPaused = false;
  v1.simulation.speed = 2;
  const restored = deserializeGame(v1);
  assert.strictEqual(restored.grid.getTile(1, 2).zone, ZONE.RESIDENTIAL, 'Save version 1 should load through an explicit migration');
  assert.strictEqual(restored.simulation.isPaused, true, 'Version 1 imports should still restore paused');
  assert.strictEqual(restored.simulation.speed, 0, 'Version 1 imports should restore paused speed');
}

{
  const seed = 24680;
  const grid = new Grid(24, 24, seed);
  const fresh = new Grid(24, 24, seed);
  let hiddenOreTile = null;
  let depositTile = null;
  let emptySurveyTile = null;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const tile = grid.getTile(x, y);
      if (tile.terrain !== TERRAIN.FLAT) continue;
      if (tile.ore && !depositTile) depositTile = tile;
      else if (!tile.ore && !emptySurveyTile) emptySurveyTile = tile;
      else if (tile.ore && depositTile && tile !== depositTile && !hiddenOreTile) hiddenOreTile = tile;
    }
  }
  assert.ok(hiddenOreTile && depositTile && emptySurveyTile, 'Generated map should include hidden ore, a surveyable deposit, and a surveyable empty tile');

  depositTile.oreDiscovered = true;
  depositTile.discoveredOre = depositTile.ore;
  emptySurveyTile.oreDiscovered = true;
  emptySurveyTile.discoveredOre = null;

  const roadTile = grid.tiles.flat().find((tile) => tile.terrain === TERRAIN.FLAT && !tile.producer);
  assert.ok(roadTile, 'Generated map should include a flat tile for a road');
  roadTile.hasRoad = true;
  const fireTile = grid.getNeighbors(roadTile.x, roadTile.y).find((tile) => tile.terrain === TERRAIN.FLAT && !tile.hasRoad);
  assert.ok(fireTile, 'A road should have a neighboring flat tile for a house');
  assert.ok(grid.placeZone(fireTile.x, fireTile.y, ZONE.RESIDENTIAL), 'Residential zone should place next to the road');
  fireTile.population = 12;
  fireTile.onFire = true;
  fireTile.fireDamage = 40;
  fireTile.shortfall = { power: true, water: false, sewage: false };
  const producerTile = grid.tiles.flat().find((tile) => (
    tile.terrain === TERRAIN.FLAT && !tile.hasRoad && tile.zone === ZONE.NONE && !tile.producer && tile !== fireTile
  ));
  assert.ok(producerTile, 'Generated map should include a flat tile for a battery');
  const battery = grid.placeProducer(producerTile.x, producerTile.y, PRODUCER_TYPE.BATTERY, 400);
  assert.ok(battery, 'Battery should place on a flat empty tile');
  battery.storedEnergy = 77;
  battery.operational = true;

  const simulation = new Simulation(grid);
  simulation.tickCount = 9;
  simulation.taxRate = 20;
  simulation.resourceManager.stockpile.coal = 15;
  simulation.resourceManager.stockpile.fuel = 8;

  const restored = deserializeGameFromJson(serializeGameToJson(makeApp(grid, simulation, {
    treasury: 1234,
    renderer: { cameraX: 40, cameraY: 8, zoom: 0.9, overlayMode: 'pollution' },
  })));

  const restoredHidden = restored.grid.getTile(hiddenOreTile.x, hiddenOreTile.y);
  const freshHidden = fresh.getTile(hiddenOreTile.x, hiddenOreTile.y);
  assert.strictEqual(restoredHidden.oreDiscovered, false, 'Untouched tiles should not keep survey knowledge');
  assert.strictEqual(restoredHidden.ore, freshHidden.ore, 'Untouched hidden ore should be regenerated from the seed');

  const restoredDeposit = restored.grid.getTile(depositTile.x, depositTile.y);
  assert.strictEqual(restoredDeposit.oreDiscovered, true, 'Discovered ore should persist');
  assert.strictEqual(restoredDeposit.discoveredOre, depositTile.ore, 'Discovered ore type should persist');
  assert.strictEqual(restoredDeposit.ore, depositTile.ore, 'Regenerated hidden ore should still match the discovered deposit');

  const restoredEmpty = restored.grid.getTile(emptySurveyTile.x, emptySurveyTile.y);
  assert.strictEqual(restoredEmpty.oreDiscovered, true, 'Surveyed no-deposit tiles should persist');
  assert.strictEqual(restoredEmpty.discoveredOre, null, 'Surveyed no-deposit tiles should remain empty');
  assert.ok(!restoredEmpty.ore, 'Surveyed no-deposit tiles should not gain ore on load');

  const restoredFire = restored.grid.getTile(fireTile.x, fireTile.y);
  assert.strictEqual(restoredFire.onFire, true, 'Saved fire should restore');
  assert.strictEqual(restoredFire.fireDamage, 40, 'Saved fire damage should restore');
  assert.strictEqual(restoredFire.population, 12, 'Saved population should restore');
  assert.strictEqual(restoredFire.shortfall.power, true, 'Saved utility shortfall should restore');
  assert.strictEqual(restored.grid.producers[0].storedEnergy, 77, 'Saved producer storage should restore');
  assert.strictEqual(restored.simulation.stockpile.coal, 15, 'Saved stockpile should restore');
  assert.deepStrictEqual(restored.camera, { x: 40, y: 8, zoom: 0.9 }, 'Saved camera should restore');
  assert.strictEqual(restored.simulation.isPaused, true, 'Restored simulation must be paused');
}

{
  const grid = new Grid(40, 40, 12345);
  for (let x = 2; x <= 8; x++) grid.placeRoad(x, 5);
  grid.placeZone(3, 4, ZONE.RESIDENTIAL);
  grid.placeZone(4, 4, ZONE.COMMERCIAL);
  grid.placeProducer(6, 4, PRODUCER_TYPE.BATTERY, 400);
  const simulation = new Simulation(grid);
  const app = makeApp(grid, simulation, { treasury: 25000, activeTool: 'pan', autoSwitchToPan: false, renderer: { cameraX: 0, cameraY: 0, zoom: 1, overlayMode: 'normal' } });
  const sparse = serializeGameToJson(app);
  const full = JSON.stringify(serializeGameV1(app));
  assert.ok(sparse.length * 10 < full.length, `Normal sparse saves should be far smaller than the full-tile format (${sparse.length} vs ${full.length})`);
  const parsed = JSON.parse(sparse);
  assert.ok(parsed.tiles.length < 80, 'A small town on a generated map should only store player/state overrides');
}

console.log('Save game round-trip tests passed.');
