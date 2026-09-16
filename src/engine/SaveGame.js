import { APP_VERSION, MAP_HEIGHT, MAP_WIDTH, PRODUCER_TYPE, TERRAIN_GENERATION_CONFIG } from '../config.js';
import { Grid } from './Grid.js';

export const SAVE_VERSION = 1;

const REQUIRED_STOCKPILE_KEYS = [
  'food', 'coal', 'oil', 'fuel', 'ironOre', 'bauxiteOre',
  'ironBar', 'bauxiteBar', 'consumerGoods', 'arms', 'tanks',
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNumber(value, name, { integer = false, min = -Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid save field: ${name}`);
  }
}

export function serializeGame(app) {
  if (!app.simulation.isPaused) throw new Error('Pause the game before saving');
  return {
    saveVersion: SAVE_VERSION,
    appVersion: APP_VERSION,
    savedAt: new Date().toISOString(),
    grid: {
      width: app.grid.width,
      height: app.grid.height,
      seed: app.grid.seed,
      biome: app.grid.biome,
      nextProducerId: app.grid.nextProducerId,
      tiles: app.grid.tiles.map((row) => row.map((tile) => ({ ...clone(tile), producer: null }))),
      producers: clone(app.grid.producers),
    },
    simulation: {
      tickCount: app.simulation.tickCount,
      isPaused: app.simulation.isPaused,
      speed: app.simulation.speed,
      taxRate: app.simulation.taxRate,
      pensionBudget: app.simulation.pensionBudget,
      stockpile: clone(app.simulation.resourceManager.stockpile),
      capacity: clone(app.simulation.resourceManager.capacity),
      stats: clone(app.simulation.stats),
    },
    treasury: app.treasury,
    camera: {
      x: app.renderer.cameraX,
      y: app.renderer.cameraY,
      zoom: app.renderer.zoom,
    },
    ui: {
      activeTool: app.activeTool,
      overlayMode: app.renderer.overlayMode,
      autoSwitchToPan: app.autoSwitchToPan,
    },
  };
}

export function serializeGameToJson(app) {
  return JSON.stringify(serializeGame(app), null, 2);
}

export function deserializeGame(document) {
  if (!document || typeof document !== 'object') throw new Error('Save must be a JSON object');
  if (document.saveVersion !== SAVE_VERSION) throw new Error(`Unsupported save version: ${document.saveVersion}`);

  const savedGrid = document.grid;
  if (!savedGrid || !Number.isInteger(savedGrid.width) || !Number.isInteger(savedGrid.height) || savedGrid.width < 1 || savedGrid.height < 1) {
    throw new Error('Invalid save grid dimensions');
  }
  if (!Array.isArray(savedGrid.tiles) || savedGrid.tiles.length !== savedGrid.height || savedGrid.tiles.some((row) => !Array.isArray(row) || row.length !== savedGrid.width)) {
    throw new Error('Invalid save tile data');
  }
  if (!Array.isArray(savedGrid.producers)) throw new Error('Invalid save producer data');
  assertNumber(savedGrid.seed, 'grid.seed', { integer: true });
  assertNumber(savedGrid.nextProducerId, 'grid.nextProducerId', { integer: true, min: 1 });
  assertNumber(document.treasury, 'treasury');

  const simulation = document.simulation;
  if (!simulation || typeof simulation !== 'object') throw new Error('Invalid save simulation data');
  assertNumber(simulation.tickCount, 'simulation.tickCount', { integer: true, min: 0 });
  if (![0, 1, 2, 5].includes(simulation.speed)) throw new Error('Invalid simulation speed');
  if (typeof simulation.isPaused !== 'boolean') throw new Error('Invalid simulation pause state');
  assertNumber(simulation.taxRate, 'simulation.taxRate', { min: 0 });
  assertNumber(simulation.pensionBudget, 'simulation.pensionBudget', { min: 0 });
  if (!simulation.stockpile || REQUIRED_STOCKPILE_KEYS.some((key) => typeof simulation.stockpile[key] !== 'number' || !Number.isFinite(simulation.stockpile[key]))) {
    throw new Error('Invalid save stockpile');
  }
  if (!document.camera || typeof document.camera !== 'object') throw new Error('Invalid save camera');
  assertNumber(document.camera.x, 'camera.x');
  assertNumber(document.camera.y, 'camera.y');
  assertNumber(document.camera.zoom, 'camera.zoom', { min: 0 });

  const producerIds = new Set();
  for (const producer of savedGrid.producers) {
    if (!producer || typeof producer !== 'object' || typeof producer.type !== 'string' || !Object.values(PRODUCER_TYPE).includes(producer.type)) {
      throw new Error(`Invalid producer type: ${producer?.type}`);
    }
    assertNumber(producer.id, 'producer.id', { integer: true, min: 1 });
    assertNumber(producer.x, 'producer.x', { integer: true, min: 0 });
    assertNumber(producer.y, 'producer.y', { integer: true, min: 0 });
    if (producer.x >= savedGrid.width || producer.y >= savedGrid.height || producerIds.has(producer.id)) {
      throw new Error('Invalid producer position or duplicate id');
    }
    producerIds.add(producer.id);
  }

  const grid = new Grid(savedGrid.width, savedGrid.height, savedGrid.seed, savedGrid.biome ?? null);
  grid.tiles = savedGrid.tiles.map((row) => row.map((savedTile, y) => {
    const tile = grid.createDefaultTile(savedTile.x ?? row.indexOf(savedTile), savedTile.y ?? y);
    Object.assign(tile, clone(savedTile));
    tile.producer = null;
    tile.distanceToProducer = Object.fromEntries(
      ['power', 'water', 'sewage'].map((key) => [key, savedTile.distanceToProducer?.[key] == null ? Infinity : savedTile.distanceToProducer[key]]),
    );
    tile.serviceDistances = savedTile.serviceDistances || {
      police: Infinity,
      fire: Infinity,
      hospital: Infinity,
      school: Infinity,
      library: Infinity,
      cityHall: Infinity,
    };
    tile.services = savedTile.services || {
      police: false,
      fire: false,
      hospital: false,
      school: false,
      library: false,
      cityHall: false,
    };
    return tile;
  }));
  grid.producers = clone(savedGrid.producers);
  grid.nextProducerId = savedGrid.nextProducerId;
  grid.terrainVersion++;
  grid.terrainChangedTiles = null;
  grid.coverageVersion++;

  for (const producer of grid.producers) {
    const tile = grid.getTile(producer.x, producer.y);
    if (!tile || tile.producer) throw new Error('Producer position collision');
    tile.producer = producer;
  }

  return {
    grid,
    simulation: {
      tickCount: simulation.tickCount,
      isPaused: simulation.isPaused,
      speed: simulation.speed,
      taxRate: simulation.taxRate,
      pensionBudget: simulation.pensionBudget,
      stockpile: clone(simulation.stockpile),
      capacity: clone(simulation.capacity || { ore: 0, bar: 0, goods: 0, oil: 0, fuel: 0 }),
      stats: clone(simulation.stats || {}),
    },
    treasury: document.treasury,
    camera: { ...document.camera },
    ui: {
      activeTool: document.ui?.activeTool || 'pan',
      overlayMode: document.ui?.overlayMode || 'normal',
      autoSwitchToPan: Boolean(document.ui?.autoSwitchToPan),
    },
  };
}

export function deserializeGameFromJson(json) {
  let document;
  try {
    document = JSON.parse(json);
  } catch {
    throw new Error('Save file is not valid JSON');
  }
  return deserializeGame(document);
}

export function createEmptySaveForTests() {
  return {
    saveVersion: SAVE_VERSION,
    grid: { width: MAP_WIDTH, height: MAP_HEIGHT, seed: TERRAIN_GENERATION_CONFIG.DEFAULT_RANDOM_SEED },
  };
}
