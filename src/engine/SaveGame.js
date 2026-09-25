import { APP_VERSION, DENSITY, MAP_HEIGHT, MAP_WIDTH, PRODUCER_TYPE, TERRAIN_GENERATION_CONFIG, ZONE } from '../config.js';
import { Grid } from './Grid.js';

export const SAVE_VERSION = 2;
export const SAVE_VERSION_V1 = 1;
export const GENERATION_VERSION = TERRAIN_GENERATION_CONFIG.GENERATION_VERSION;

const REQUIRED_STOCKPILE_KEYS = [
  'food', 'coal', 'oil', 'fuel', 'ironOre', 'bauxiteOre',
  'ironBar', 'bauxiteBar', 'consumerGoods', 'arms', 'tanks',
];

const EMPTY_STOCKPILE = Object.fromEntries(REQUIRED_STOCKPILE_KEYS.map((key) => [key, 0]));
const EMPTY_SHORTFALL = { power: false, water: false, sewage: false };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNumber(value, name, { integer = false, min = -Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid save field: ${name}`);
  }
}

function sameDir(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y;
}

function anyShortfall(shortfall) {
  return Boolean(shortfall && (shortfall.power || shortfall.water || shortfall.sewage));
}

function collectTileOverride(tile, base) {
  const override = { x: tile.x, y: tile.y };
  let extra = 0;
  const add = (key, value) => {
    override[key] = value;
    extra += 1;
  };

  if (tile.terrain !== base.terrain) add('terrain', tile.terrain);
  if (!sameDir(tile.riverFlowDir, base.riverFlowDir)) add('riverFlowDir', tile.riverFlowDir);
  if (tile.hasRoad) add('hasRoad', true);
  if (tile.hasBridge) add('hasBridge', true);
  if (tile.hasTunnel) add('hasTunnel', true);
  if (tile.destroyed) add('destroyed', true);
  if (tile.zone && tile.zone !== ZONE.NONE) {
    add('zone', tile.zone);
    if (tile.density && tile.density !== DENSITY.LIGHT) add('density', tile.density);
    if (tile.growthScore) add('growthScore', tile.growthScore);
    if (tile.recipe && tile.recipe !== 'CONSUMER_GOODS') add('recipe', tile.recipe);
  }
  if (tile.population) add('population', tile.population);
  if (tile.maxPopulation) add('maxPopulation', tile.maxPopulation);
  if (tile.filledJobs) add('filledJobs', tile.filledJobs);
  if (tile.totalJobs) add('totalJobs', tile.totalJobs);
  if (tile.relocatedPopulation) add('relocatedPopulation', tile.relocatedPopulation);
  if (tile.fireDisplacedPopulation) add('fireDisplacedPopulation', tile.fireDisplacedPopulation);
  if (tile.populationLoss) add('populationLoss', tile.populationLoss);
  if (anyShortfall(tile.shortfall)) add('shortfall', { ...EMPTY_SHORTFALL, ...tile.shortfall });
  if (tile.connected) add('connected', true);
  if (tile.pollution) add('pollution', tile.pollution);
  if (tile.isPolluted) add('isPolluted', true);
  if (tile.riverPollution) add('riverPollution', tile.riverPollution);
  if (tile.crime) add('crime', tile.crime);
  if (tile.onFire) add('onFire', true);
  if (tile.fireDamage) add('fireDamage', tile.fireDamage);
  if ((tile.fireRepair ?? 1) !== 1) add('fireRepair', tile.fireRepair);
  if (tile.forestFireInjury != null) add('forestFireInjury', tile.forestFireInjury);
  if (tile.oreDiscovered) {
    add('oreDiscovered', true);
    if (tile.discoveredOre) add('discoveredOre', tile.discoveredOre);
  }
  if (tile.surveyingBy) {
    add('surveyingBy', tile.surveyingBy);
    if (tile.surveyProgress) add('surveyProgress', tile.surveyProgress);
    if (tile.surveyRequired) add('surveyRequired', tile.surveyRequired);
  }

  return extra > 0 ? override : null;
}

function applyTileOverride(tile, override) {
  if (override.terrain != null) tile.terrain = override.terrain;
  if ('riverFlowDir' in override) tile.riverFlowDir = override.riverFlowDir;
  if (override.hasRoad) tile.hasRoad = true;
  if (override.hasBridge) tile.hasBridge = true;
  if (override.hasTunnel) tile.hasTunnel = true;
  if (override.destroyed) tile.destroyed = true;
  if (override.zone) tile.zone = override.zone;
  if (override.density) tile.density = override.density;
  if (override.growthScore != null) tile.growthScore = override.growthScore;
  if (override.recipe) tile.recipe = override.recipe;
  if (override.population != null) tile.population = override.population;
  if (override.maxPopulation != null) tile.maxPopulation = override.maxPopulation;
  if (override.filledJobs != null) tile.filledJobs = override.filledJobs;
  if (override.totalJobs != null) tile.totalJobs = override.totalJobs;
  if (override.relocatedPopulation) tile.relocatedPopulation = override.relocatedPopulation;
  if (override.fireDisplacedPopulation) tile.fireDisplacedPopulation = override.fireDisplacedPopulation;
  if (override.populationLoss) tile.populationLoss = override.populationLoss;
  if (override.shortfall) tile.shortfall = { ...EMPTY_SHORTFALL, ...override.shortfall };
  if (override.connected) tile.connected = true;
  if (override.pollution) tile.pollution = override.pollution;
  if (override.isPolluted) tile.isPolluted = true;
  if (override.riverPollution) tile.riverPollution = override.riverPollution;
  if (override.crime) tile.crime = override.crime;
  if (override.onFire) tile.onFire = true;
  if (override.fireDamage) tile.fireDamage = override.fireDamage;
  if (override.fireRepair != null) tile.fireRepair = override.fireRepair;
  if (override.forestFireInjury != null) tile.forestFireInjury = override.forestFireInjury;
  if (override.oreDiscovered) {
    tile.oreDiscovered = true;
    tile.discoveredOre = override.discoveredOre ?? null;
  }
  if (override.surveyingBy) {
    tile.surveyingBy = override.surveyingBy;
    tile.surveyProgress = override.surveyProgress || 0;
    tile.surveyRequired = override.surveyRequired || 0;
  }
}

function collectTileOverrides(grid) {
  const base = new Grid(grid.width, grid.height, grid.seed, grid.biome);
  const overrides = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const override = collectTileOverride(grid.tiles[y][x], base.tiles[y][x]);
      if (override) overrides.push(override);
    }
  }
  return overrides;
}

function validateSimulation(simulation) {
  if (!simulation || typeof simulation !== 'object') throw new Error('Invalid save simulation data');
  assertNumber(simulation.tickCount, 'simulation.tickCount', { integer: true, min: 0 });
  if (![0, 1, 2, 5].includes(simulation.speed)) throw new Error('Invalid simulation speed');
  assertNumber(simulation.taxRate, 'simulation.taxRate', { min: 0 });
  assertNumber(simulation.pensionBudget, 'simulation.pensionBudget', { min: 0 });
  if (!simulation.stockpile || REQUIRED_STOCKPILE_KEYS.some((key) => typeof simulation.stockpile[key] !== 'number' || !Number.isFinite(simulation.stockpile[key]))) {
    throw new Error('Invalid save stockpile');
  }
}

function validateCamera(camera) {
  if (!camera || typeof camera !== 'object') throw new Error('Invalid save camera');
  assertNumber(camera.x, 'camera.x');
  assertNumber(camera.y, 'camera.y');
  assertNumber(camera.zoom, 'camera.zoom', { min: 0 });
}

function validateProducers(producers, width, height) {
  if (!Array.isArray(producers)) throw new Error('Invalid save producer data');
  const producerIds = new Set();
  for (const producer of producers) {
    if (!producer || typeof producer !== 'object' || typeof producer.type !== 'string' || !Object.values(PRODUCER_TYPE).includes(producer.type)) {
      throw new Error(`Invalid producer type: ${producer?.type}`);
    }
    assertNumber(producer.id, 'producer.id', { integer: true, min: 1 });
    assertNumber(producer.x, 'producer.x', { integer: true, min: 0 });
    assertNumber(producer.y, 'producer.y', { integer: true, min: 0 });
    if (producer.x >= width || producer.y >= height || producerIds.has(producer.id)) {
      throw new Error('Invalid producer position or duplicate id');
    }
    producerIds.add(producer.id);
  }
}

function restoredSimulation(simulation) {
  return {
    tickCount: simulation.tickCount,
    isPaused: true,
    speed: 0,
    taxRate: simulation.taxRate,
    pensionBudget: simulation.pensionBudget,
    stockpile: clone(simulation.stockpile),
    capacity: clone(simulation.capacity || { ore: 0, bar: 0, goods: 0, oil: 0, fuel: 0 }),
    stats: clone(simulation.stats || {}),
  };
}

function restoredUi(ui) {
  return {
    activeTool: ui?.activeTool || 'pan',
    overlayMode: ui?.overlayMode || 'normal',
    autoSwitchToPan: Boolean(ui?.autoSwitchToPan),
  };
}

function finishGridRestore(grid, producers, nextProducerId) {
  grid.producers = [];
  grid.nextProducerId = nextProducerId;
  for (const saved of producers) {
    const producer = clone(saved);
    const tile = grid.getTile(producer.x, producer.y);
    if (!tile || tile.producer) throw new Error('Producer position collision');
    tile.producer = producer;
    grid.producers.push(producer);
  }
  grid.terrainVersion++;
  grid.terrainChangedTiles = null;
  grid.coverageVersion++;
  grid.pollutionDirty = true;
  grid.rebuildActiveTileSets();
}

export function serializeGame(app) {
  if (!app.simulation.isPaused) throw new Error('Pause the game before saving');
  return {
    saveVersion: SAVE_VERSION,
    appVersion: APP_VERSION,
    generationVersion: GENERATION_VERSION,
    savedAt: new Date().toISOString(),
    map: {
      width: app.grid.width,
      height: app.grid.height,
      seed: app.grid.seed,
      biome: app.grid.biome ?? null,
      nextProducerId: app.grid.nextProducerId,
    },
    tiles: collectTileOverrides(app.grid),
    producers: clone(app.grid.producers),
    simulation: {
      tickCount: app.simulation.tickCount,
      isPaused: true,
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
  return JSON.stringify(serializeGame(app));
}

export function serializeGameV1(app) {
  if (!app.simulation.isPaused) throw new Error('Pause the game before saving');
  return {
    saveVersion: SAVE_VERSION_V1,
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

function deserializeV1(document) {
  const savedGrid = document.grid;
  if (!savedGrid || !Number.isInteger(savedGrid.width) || !Number.isInteger(savedGrid.height) || savedGrid.width < 1 || savedGrid.height < 1) {
    throw new Error('Invalid save grid dimensions');
  }
  if (!Array.isArray(savedGrid.tiles) || savedGrid.tiles.length !== savedGrid.height || savedGrid.tiles.some((row) => !Array.isArray(row) || row.length !== savedGrid.width)) {
    throw new Error('Invalid save tile data');
  }
  assertNumber(savedGrid.seed, 'grid.seed', { integer: true });
  assertNumber(savedGrid.nextProducerId, 'grid.nextProducerId', { integer: true, min: 1 });
  assertNumber(document.treasury, 'treasury');
  validateSimulation(document.simulation);
  if (typeof document.simulation.isPaused !== 'boolean') throw new Error('Invalid simulation pause state');
  validateCamera(document.camera);
  validateProducers(savedGrid.producers, savedGrid.width, savedGrid.height);

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
  finishGridRestore(grid, savedGrid.producers, savedGrid.nextProducerId);

  return {
    grid,
    simulation: restoredSimulation(document.simulation),
    treasury: document.treasury,
    camera: { ...document.camera },
    ui: restoredUi(document.ui),
  };
}

function deserializeV2(document) {
  if (document.generationVersion !== GENERATION_VERSION) {
    throw new Error(
      `This save uses terrain generation version ${document.generationVersion}; the game now uses version ${GENERATION_VERSION}. The map cannot be rebuilt from this save.`,
    );
  }

  const map = document.map;
  if (!map || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.height < 1) {
    throw new Error('Invalid save grid dimensions');
  }
  assertNumber(map.seed, 'map.seed', { integer: true });
  assertNumber(map.nextProducerId, 'map.nextProducerId', { integer: true, min: 1 });
  assertNumber(document.treasury, 'treasury');
  validateSimulation(document.simulation);
  validateCamera(document.camera);
  if (!Array.isArray(document.tiles)) throw new Error('Invalid save tile data');
  validateProducers(document.producers, map.width, map.height);

  const grid = new Grid(map.width, map.height, map.seed, map.biome ?? null);
  for (const override of document.tiles) {
    if (!override || typeof override !== 'object') throw new Error('Invalid save tile override');
    assertNumber(override.x, 'tile.x', { integer: true, min: 0 });
    assertNumber(override.y, 'tile.y', { integer: true, min: 0 });
    const tile = grid.getTile(override.x, override.y);
    if (!tile) throw new Error('Save tile override is outside the map');
    applyTileOverride(tile, override);
  }
  finishGridRestore(grid, document.producers, map.nextProducerId);

  return {
    grid,
    simulation: restoredSimulation(document.simulation),
    treasury: document.treasury,
    camera: { ...document.camera },
    ui: restoredUi(document.ui),
  };
}

export function deserializeGame(document) {
  if (!document || typeof document !== 'object') throw new Error('Save must be a JSON object');
  if (document.saveVersion === SAVE_VERSION_V1) return deserializeV1(document);
  if (document.saveVersion !== SAVE_VERSION) throw new Error(`Unsupported save version: ${document.saveVersion}`);
  return deserializeV2(document);
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
    generationVersion: GENERATION_VERSION,
    map: { width: MAP_WIDTH, height: MAP_HEIGHT, seed: TERRAIN_GENERATION_CONFIG.DEFAULT_RANDOM_SEED, biome: null, nextProducerId: 1 },
    tiles: [],
    producers: [],
  };
}
