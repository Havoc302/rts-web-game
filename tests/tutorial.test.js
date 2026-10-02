import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

console.log('=== tutorial.test.js ===');

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, { id, style: {}, textContent: '', checked: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  return elements.get(id);
};
globalThis.document = { getElementById: element };

const { TutorialManager, TUTORIAL_STEPS } = await import('../src/engine/TutorialManager.js');

const grid = new Grid(12, 12, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
const stats = { population: 0 };

element('welcome-modal').style.display = 'none';
const deferred = new TutorialManager({ currentCellId: null }, { showWelcome: false });
assert.strictEqual(element('welcome-modal').style.display, 'none', 'Startup should defer welcome until the globe is ready');
deferred.checkWelcomeModal();
assert.strictEqual(element('welcome-modal').style.display, 'flex', 'Welcome should be shown after the globe is ready');

const app = { currentCellId: null };
const tutorial = new TutorialManager(app);
assert.strictEqual(tutorial.currentStep, 0);
assert.strictEqual(element('welcome-modal').style.display, 'flex', 'Welcome modal should show on first visit');
assert.strictEqual(element('tutorial-banner').style.display, 'flex');
assert.strictEqual(element('tutorial-step-title').textContent, TUTORIAL_STEPS[0].title);

assert.strictEqual(TUTORIAL_STEPS[0].title, 'Step 1: Select a map tile');
assert.strictEqual(TUTORIAL_STEPS.length, 6);
assert.ok(TUTORIAL_STEPS.every((step, index) => step.title.startsWith(`Step ${index + 1}:`)), 'All instruction steps should be renumbered');
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 0, 'Map selection must happen before city-building steps');
app.currentCellId = 'selected-land-hex';
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 1, 'Opening a selected map should advance to roads');

// Step 2: roads come first because every building must be road-adjacent.
grid.getTile(0, 3).terrain = TERRAIN.WATER;
grid.getTile(0, 5).terrain = TERRAIN.WATER;
grid.getTile(0, 7).terrain = TERRAIN.WATER;
grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 120);
grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 120);
assert.ok(grid.placeProducer(1, 7, PRODUCER_TYPE.NUCLEAR_PLANT, 500));
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 1, 'Utilities without roads should not pass the road step');
for (let y = 1; y <= 6; y++) grid.placeRoad(2, y);
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 2, 'A utility not touching a road should block the utility step');
grid.placeRoad(2, 7);
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 3, 'Roads then road-connected utilities should advance together');

// Step 3: battery alone does not count as power generation.
const fresh = new Grid(12, 12, 1);
for (const row of fresh.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
for (let y = 1; y <= 5; y++) fresh.placeRoad(2, y);
fresh.getTile(0, 3).terrain = TERRAIN.WATER;
fresh.getTile(0, 5).terrain = TERRAIN.WATER;
fresh.placeProducer(1, 1, PRODUCER_TYPE.BATTERY, 400);
fresh.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 120);
fresh.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 120);
assert.strictEqual(TUTORIAL_STEPS[2].check(fresh, stats), false, 'Battery alone should not satisfy power generation');

grid.placeZone(3, 2, ZONE.RESIDENTIAL);
grid.placeZone(3, 3, ZONE.AGRICULTURAL);
grid.placeZone(3, 4, ZONE.COMMERCIAL);
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, 5, 'Already-satisfied steps should advance together');
assert.strictEqual(localStorage.getItem('simconquer_tutorial_step'), '5');

stats.population = 3;
tutorial.update(grid, stats);
assert.strictEqual(tutorial.currentStep, TUTORIAL_STEPS.length);
assert.strictEqual(element('tutorial-banner').style.display, 'none', 'Banner hides after the final step');

// Skip & Play with "don't show again" persists both choices.
element('chk-welcome-dont-show').checked = true;
element('btn-skip-welcome').listeners.click();
assert.strictEqual(localStorage.getItem('simconquer_welcome_dismissed'), 'true');
assert.strictEqual(localStorage.getItem('simconquer_tutorial_enabled'), 'false');
assert.strictEqual(element('welcome-modal').style.display, 'none');

element('welcome-modal').style.display = '';
const returning = new TutorialManager({});
assert.strictEqual(returning.isEnabled, false);
assert.notStrictEqual(element('welcome-modal').style.display, 'flex', 'Dismissed welcome modal should stay hidden');

// Start Guided Tutorial after a finished run must show Step 1 again.
returning.currentStep = TUTORIAL_STEPS.length;
element('btn-start-tutorial').listeners.click();
assert.strictEqual(returning.currentStep, 0);
assert.strictEqual(returning.isEnabled, true);
assert.strictEqual(element('tutorial-banner').style.display, 'flex', 'Start should show the banner');
assert.strictEqual(element('tutorial-step-title').textContent, TUTORIAL_STEPS[0].title);

console.log('Tutorial tests passed.');
