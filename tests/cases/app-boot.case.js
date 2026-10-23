// Boots the real GameApp against a stub DOM to pin the "no city yet" state. Boot and `New Game`
// deliberately leave `grid`/`simulation` null, and every tick, render, input handler and save path
// has to tolerate that; without this case a new feature can silently break the title screen.
import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import { Simulation } from '../../src/engine/Simulation.js';
import { serializeGame } from '../../src/engine/SaveGame.js';
import { TERRAIN } from '../../src/config.js';

console.log('=== app-boot.case.js ===');

// --- A DOM stub just complete enough for GameApp's constructor and event wiring ------------
const alerts = [];

function createContext() {
  return new Proxy({ measureText: () => ({ width: 10 }) }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return typeof prop === 'string' ? () => {} : undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function createElement(tagName = 'div', id = '') {
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    id,
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    dataset: {},
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name),
    },
    children: [],
    options: [],
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    checked: false,
    open: false,
    width: 0,
    height: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    parentElement: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    appendChild(child) { element.children.push(child); return child; },
    append(...nodes) { element.children.push(...nodes); },
    replaceChildren(...nodes) { element.children = [...nodes]; },
    removeChild(child) { element.children = element.children.filter((node) => node !== child); return child; },
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    hasAttribute: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
    getContext: () => createContext(),
    focus() {},
    blur() {},
    click() {},
    remove() {},
    closest: () => null,
  };
  return element;
}

const elements = new Map();
const readyHandlers = [];

globalThis.localStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
  setItem(key, value) { this.store.set(key, String(value)); },
  removeItem(key) { this.store.delete(key); },
  clear() { this.store.clear(); },
};

globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, createElement('div', id));
    return elements.get(id);
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tagName) => createElement(tagName),
  addEventListener() {},
  removeEventListener() {},
  body: createElement('body'),
  documentElement: createElement('html'),
  head: createElement('head'),
};

globalThis.window = {
  app: null,
  location: { search: '', href: 'http://localhost:3000/' },
  history: { replaceState() {} },
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 1,
  addEventListener(type, handler) {
    if (type === 'DOMContentLoaded') readyHandlers.push(handler);
  },
  removeEventListener() {},
  requestAnimationFrame: () => 0,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
  confirm: () => true,
  alert: (message) => alerts.push(String(message)),
};

globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;

await import('../../src/main.js');

for (const handler of readyHandlers) handler();
const app = globalThis.window.app;
assert.ok(app, 'The app should boot from DOMContentLoaded');

// --- Title screen: no city exists yet ----------------------------------------------------
assert.strictEqual(app.grid, null, 'Boot leaves no city grid');
assert.strictEqual(app.simulation, null, 'Boot leaves no simulation');
assert.strictEqual(app.hasCity, false, 'hasCity is the single "a city is loaded" test');
assert.strictEqual(app.worldActive, false, 'Boot stays on the title screen');
assert.strictEqual(app.getCombinedPopulation(), 0, 'Population helpers tolerate no city');
assert.strictEqual(app.hasWorldProgress(), false, 'A pristine boot has no progress to lose');
assert.strictEqual(app.screenToTile(10, 10), null, 'Picking a tile without a map returns null');

// Every frame, input event and HUD refresh must survive the no-city state.
assert.doesNotThrow(() => app.refreshCityCanvas(), 'Repainting without a city is a no-op');
assert.doesNotThrow(() => app.updateHUD({ force: true }), 'The HUD must tolerate no city');
assert.doesNotThrow(() => app.simTick(), 'A stray tick must not throw');
assert.doesNotThrow(() => app.jumpToAlert({ x: 0, y: 0 }), 'Alert jumps need a map, not a crash');
assert.doesNotThrow(() => app.renderNotifications('[]'), 'The notifications panel renders empty');
assert.doesNotThrow(() => app.setSpeed(0), 'Pausing with no city is harmless');
assert.strictEqual(app.setSpeed(1), false, 'The clock cannot start without a city');
assert.strictEqual(app.togglePause(), false, 'Space cannot start the clock without a city');
assert.strictEqual(app.simInterval, null, 'Nothing was scheduled');

// Saving refuses, at the app level and in the serializer.
app.saveGameToFile();
assert.ok(alerts.some((message) => /Open a city map/.test(message)),
  'Save World explains that a city must be opened first');
assert.throws(() => serializeGame(app), /Open a city map before saving/,
  'The serializer refuses a document with no map block');

// --- Opening a map is what creates the city ----------------------------------------------
const grid = new Grid(8, 8, 7);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
const simulation = new Simulation(grid);
app.grid = grid;
app.simulation = simulation;
app.worldActive = true;
simulation.computeStats();

assert.strictEqual(app.hasCity, true, 'grid plus simulation is a loaded city');
assert.strictEqual(app.getCombinedPopulation(), 0, 'An empty city has nobody in it');
assert.strictEqual(app.updateHUD({ force: true }), true, 'The HUD applies once a city exists');
assert.strictEqual(elements.get('stat-pop')?.textContent, '0', 'The HUD writes the population chip');
assert.strictEqual(app.setSpeed(0), true, 'Pausing a live city works');

// The boot menu is still open here, so the shortcut must stay out of the way.
assert.strictEqual(app.togglePause(), false, 'Space does nothing while the main menu is open');
app.hideMainMenu();

// Space resumes at the last speed, and is paused again immediately so no timer keeps the test alive.
assert.strictEqual(app.togglePause(), true, 'Space resumes once a city exists and the menu is closed');
app.setSpeed(0);
assert.strictEqual(simulation.isPaused, true, 'The clock is paused again for the next case');

const saved = serializeGame(app);
assert.strictEqual(saved.map.width, grid.width, 'A loaded city serializes normally');
assert.strictEqual(saved.map.height, grid.height);

console.log('App boot tests passed.');
