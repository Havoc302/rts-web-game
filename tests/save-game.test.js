import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { serializeGame, deserializeGame, deserializeGameFromJson, SAVE_VERSION } from '../src/engine/SaveGame.js';
import { PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

const grid = new Grid(8, 8, 12345);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
grid.placeRoad(2, 2);
grid.placeZone(2, 1, ZONE.RESIDENTIAL);
const battery = grid.placeProducer(4, 4, PRODUCER_TYPE.BATTERY, 400);
battery.storedEnergy = 123;
const simulation = new Simulation(grid);
simulation.isPaused = true;
simulation.tickCount = 17;
simulation.taxRate = 35;
simulation.pensionBudget = 80;
simulation.resourceManager.stockpile.food = 42;

const app = {
  grid,
  simulation,
  treasury: 9876,
  activeTool: 'survey',
  autoSwitchToPan: true,
  renderer: { cameraX: 12, cameraY: -8, zoom: 1.4, overlayMode: 'survey' },
};

const restored = deserializeGameFromJson(JSON.stringify(serializeGame(app)));
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
  () => deserializeGameFromJson('{not json'),
  /not valid JSON/,
  'Malformed JSON should be rejected',
);

console.log('Save game round-trip tests passed.');