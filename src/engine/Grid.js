import { TERRAIN, TERRAIN_TYPE, ZONE, DENSITY, GROWTH_CONFIG, RESIDENTIAL_CAPACITY, MAP_WIDTH, MAP_HEIGHT, PRODUCER_CONFIG, PRODUCER_TYPE, ORE_CONFIG, ORE_GENERATION, SERVICE_GLOBAL_CONFIG, TERRAIN_GENERATION_CONFIG, ICE_CONFIG, COAST_CONFIG, COAST_DIRECTIONS, MAP_SEED_STORAGE_KEY, MAP_SEED_STORAGE_KEY_LEGACY, BIOME_CONFIG, BIOME_TERRAIN_CONFIG, BIOME_LAKE_CONFIG, BIOME_GENERATION_VERSION, BIOME_TYPES, PRODUCER_TIER_MAX, clampTier, getProducerTier, isTieredService, isTieredProducer, isBuildableTerrain, getBatteryStorageForTier, getWindPeakForTier, getSolarPeakForTier, getWaterCapacityForTier, getSewageCapacityForTier, getServiceTierStat } from '../config.js';

const TIER_DENSITY = [DENSITY.LIGHT, DENSITY.MEDIUM, DENSITY.HIGH];

// One anchor + outward normal per ocean-facing hex edge, in tile-map space. Side edges use
// the middle of that map side; diagonal edges use the matching corner, so a hex that faces
// the sea on two edges gets two different bands. E and W are not hex edges: they are used when
// two ocean corners share a map side, so the sea joins up around that side instead of leaving
// dry land between two corner wedges.
const COAST_EDGES = {
  N: { ax: 0, ay: -0.5, nx: 0, ny: -1 },
  NE: { ax: 0.5, ay: -0.5, nx: Math.SQRT1_2, ny: -Math.SQRT1_2 },
  E: { ax: 0.5, ay: 0, nx: 1, ny: 0 },
  SE: { ax: 0.5, ay: 0.5, nx: Math.SQRT1_2, ny: Math.SQRT1_2 },
  S: { ax: 0, ay: 0.5, nx: 0, ny: 1 },
  SW: { ax: -0.5, ay: 0.5, nx: -Math.SQRT1_2, ny: Math.SQRT1_2 },
  W: { ax: -0.5, ay: 0, nx: -1, ny: 0 },
  NW: { ax: -0.5, ay: -0.5, nx: -Math.SQRT1_2, ny: -Math.SQRT1_2 },
};

// A map side is flooded when it carries a side edge, or when both corners on that side are
// ocean, so a hex that is sea on NW and SW gets one continuous west coast. This also closes an
// all-ocean hex into a ring without a separate island rule.
const COAST_SIDE_PAIRS = [
  { side: 'N', corners: ['NW', 'NE'] },
  { side: 'E', corners: ['NE', 'SE'] },
  { side: 'S', corners: ['SE', 'SW'] },
  { side: 'W', corners: ['SW', 'NW'] },
];

// Which map edge a river mouth should use for a given ocean-facing hex edge, and which half of
// that edge the sea covers. Side coasts flood the whole side; corner coasts flood a corner band.
const COAST_RIVER_MOUTHS = {
  N: [{ edge: 'top', half: 'full' }],
  S: [{ edge: 'bottom', half: 'full' }],
  NE: [{ edge: 'top', half: 'high' }, { edge: 'right', half: 'low' }],
  SE: [{ edge: 'bottom', half: 'high' }, { edge: 'right', half: 'high' }],
  SW: [{ edge: 'bottom', half: 'low' }, { edge: 'left', half: 'high' }],
  NW: [{ edge: 'top', half: 'low' }, { edge: 'left', half: 'low' }],
};

/** Keeps only known directions, in canonical order, without duplicates. */
export function normalizeCoast(coast) {
  if (!Array.isArray(coast)) return [];
  const unique = new Set(coast.filter((direction) => COAST_DIRECTIONS.includes(direction)));
  return COAST_DIRECTIONS.filter((direction) => unique.has(direction));
}

function coastHash(seed, x, y) {
  let h = Math.imul((seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise over a coarse lattice, used to bend the coastline.
function coastNoise(seed, x, y, scale) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = (fx - x0) ** 2 * (3 - 2 * (fx - x0));
  const ty = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
  const a = coastHash(seed, x0, y0);
  const b = coastHash(seed, x0 + 1, y0);
  const c = coastHash(seed, x0, y0 + 1);
  const d = coastHash(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

export function producerTypeForTool(tool) {
  if (!tool?.startsWith('producer_')) return null;
  const typeKey = tool.replace('producer_', '').toUpperCase();
  return PRODUCER_TYPE[typeKey] || PRODUCER_TYPE[`${typeKey}_PLANT`] || PRODUCER_TYPE[`${typeKey}_TOWER`] || null;
}

export function createPRNG(seed) {
  let h = Math.imul((parseInt(seed, 10) || TERRAIN_GENERATION_CONFIG.DEFAULT_RANDOM_SEED) ^ 0x6d2b79f5, 0x15a4e35d);
  h = Math.imul(h ^ (h >>> 15), 0x61243495);
  let s = (h ^ (h >>> 13)) >>> 0;

  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Grid {
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT, seed = null, biome = null, generationVersion = TERRAIN_GENERATION_CONFIG.GENERATION_VERSION, biomeGenerationVersion = generationVersion >= 2 ? BIOME_GENERATION_VERSION : 1, coast = []) {
    this.width = width;
    this.height = height;
    this.biome = biome;
    this.generationVersion = generationVersion;
    this.biomeGenerationVersion = biomeGenerationVersion;
    // Hex edges that face ocean on the overworld. Persisted with the save so a loaded city
    // regenerates exactly the same coastline.
    this.coast = normalizeCoast(coast);
    this.seed = seed !== null ? parseInt(seed, 10) : this.getInitialSeed();
    this.random = createPRNG(this.seed);
    this.tiles = [];
    this.producers = [];
    this.nextProducerId = 1;
    this.terrainVersion = 0;
    this.terrainChangedTiles = new Set();
    this.coverageVersion = 0;
    this.activeZonedTiles = new Set();
    this.activeRoadTiles = new Set();
    this.activeFireTiles = new Set();
    this.fireCandidateTiles = new Set();
    this.repairingTiles = new Set();
    this.pollutedTiles = new Set();
    this.pollutedWaterTiles = new Set();
    this.pollutionDirty = true;
    this.pollutionStateKey = null;
    this.pollutionSum = 0;
    this.pollutionMax = 0;

    this.initGrid();
  }

  persistSeed() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MAP_SEED_STORAGE_KEY, this.seed);
    localStorage.removeItem(MAP_SEED_STORAGE_KEY_LEGACY);
  }

  terrainKey(x, y) {
    return y * this.width + x;
  }

  markTerrainChanged(x, y) {
    this.terrainVersion++;
    if (!this.terrainChangedTiles) this.terrainChangedTiles = new Set();
    this.terrainChangedTiles.add(this.terrainKey(x, y));
  }

  consumeTerrainChanges() {
    const changed = this.terrainChangedTiles;
    this.terrainChangedTiles = new Set();
    return changed;
  }

  getInitialSeed() {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paramSeed = parseInt(urlParams.get('seed'), 10);
      if (!isNaN(paramSeed) && paramSeed > 0) return paramSeed;

      const savedSeed = parseInt(localStorage.getItem(MAP_SEED_STORAGE_KEY), 10);
      if (!isNaN(savedSeed) && savedSeed > 0) return savedSeed;
      const legacySeed = parseInt(localStorage.getItem(MAP_SEED_STORAGE_KEY_LEGACY), 10);
      if (!isNaN(legacySeed) && legacySeed > 0) return legacySeed;
    }
    const newSeed = Math.floor(Math.random() * TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MAX) + TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MIN;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MAP_SEED_STORAGE_KEY, newSeed);
    }
    return newSeed;
  }

  initGrid() {
    this.randomizeGrid(this.seed, this.biome, this.generationVersion, this.biomeGenerationVersion, this.coast);
  }

  randomizeGrid(seed = null, biome = this.biome, generationVersion = TERRAIN_GENERATION_CONFIG.GENERATION_VERSION, biomeGenerationVersion = BIOME_GENERATION_VERSION, coast = this.coast) {
    if (seed !== null && !isNaN(parseInt(seed, 10))) {
      this.seed = parseInt(seed, 10);
    }
    if (coast !== undefined) this.coast = normalizeCoast(coast);
    if (biome !== undefined) {
      this.biome = biome;
    }
    this.generationVersion = generationVersion;
    this.biomeGenerationVersion = biomeGenerationVersion;
    this.persistSeed();
    this.random = createPRNG(this.seed);
    this.terrainVersion++;
    this.terrainChangedTiles = null;

    this.tiles = [];
    this.producers = [];
    this.riverSources = [];
    this.mountainSprings = null;
    this.coastWater = null;
    this.seaDistance = null;
    this.activeZonedTiles.clear();
    this.activeRoadTiles.clear();
    this.activeFireTiles.clear();
    this.fireCandidateTiles.clear();
    this.repairingTiles.clear();
    this.pollutedTiles.clear();
    this.pollutedWaterTiles.clear();
    this.pollutionDirty = true;
    this.pollutionStateKey = null;
    this.pollutionSum = 0;
    this.pollutionMax = 0;
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        row.push(this.createDefaultTile(x, y));
      }
      this.tiles.push(row);
    }

    this.generateProceduralTerrain(this.biome);
    this.generateHiddenOres();
    this.rebuildFireCandidateTiles();
  }

  generateHiddenOres() {
    const oreScale = this.getBiomeModifiers().oreScale ?? 1;
    if (oreScale <= 0) return;
    const oreTypes = Object.keys(ORE_CONFIG);
    const weights = oreTypes.map((type) => ORE_CONFIG[type].spawnWeight ?? 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    for (const row of this.tiles) {
      for (const tile of row) {
        if (this.random() >= (ORE_GENERATION[tile.terrain] || 0) * oreScale) continue;
        // Weighted pick so common metals stay common and titanium stays a rare find. One
        // draw, matching the previous uniform pick's PRNG usage.
        let roll = this.random() * totalWeight;
        let index = 0;
        while (index < weights.length - 1 && roll >= weights[index]) {
          roll -= weights[index];
          index++;
        }
        tile.ore = oreTypes[index];
      }
    }
  }

  createDefaultTile(x, y) {
    return {
      x,
      y,
      terrain: TERRAIN_TYPE.EMPTY,
      hasRoad: false,
      hasBridge: false,
      hasTunnel: false,
      roadDamage: 0,
      zone: ZONE.NONE,
      density: DENSITY.LIGHT,
      growthScore: 0,
      population: 0,
      recipe: 'CONSUMER_GOODS',
      relocatedPopulation: 0,
      fireDisplacedPopulation: 0,
      populationLoss: 0,
      producer: null,
      shortfall: { power: false, water: false, sewage: false },
      connected: false,
      distanceToProducer: { power: Infinity, water: Infinity, sewage: Infinity },
      pollution: 0,
      ore: null,
      oreDiscovered: false,
      discoveredOre: null,
      surveyingBy: null,
      surveyProgress: 0,
      surveyRequired: 0,
      riverFlowDir: null,
      isPolluted: false,
      riverPollution: 0,
      crime: 0,
      crimeDecayTicks: 0,
      onFire: false,
      fireDamage: 0,
      fireRepair: 1,
      forestFireInjury: null,
      destroyed: false,
    };
  }

  rebuildFireCandidateTiles() {
    this.fireCandidateTiles.clear();
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.terrain === TERRAIN.FOREST) this.fireCandidateTiles.add(tile);
      }
    }
  }

  rebuildActiveTileSets() {
    this.activeZonedTiles.clear();
    this.activeRoadTiles.clear();
    this.activeFireTiles.clear();
    this.fireCandidateTiles.clear();
    this.repairingTiles.clear();
    this.pollutedTiles = new Set();
    this.pollutedWaterTiles = new Set();
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.zone !== ZONE.NONE) this.activeZonedTiles.add(tile);
        if (tile.hasRoad) this.activeRoadTiles.add(tile);
        if (tile.onFire) this.activeFireTiles.add(tile);
        if (tile.terrain === TERRAIN.FOREST || tile.zone !== ZONE.NONE || tile.producer) {
          this.fireCandidateTiles.add(tile);
        }
        if ((tile.fireRepair ?? 1) < 1) this.repairingTiles.add(tile);
        if (tile.pollution > 0) this.pollutedTiles.add(tile);
        if (tile.isPolluted || tile.riverPollution > 0) this.pollutedWaterTiles.add(tile);
      }
    }
    this.refreshPollutionAggregates();
  }

  refreshPollutionAggregates() {
    let sum = 0;
    let max = 0;
    for (const tile of this.pollutedTiles) {
      const pollution = tile.pollution || 0;
      if (pollution <= 0) continue;
      sum += pollution;
      if (pollution > max) max = pollution;
    }
    this.pollutionSum = sum;
    this.pollutionMax = max;
  }

  getFireCandidateTiles() {
    return new Set([...this.fireCandidateTiles, ...this.activeZonedTiles, ...this.producers.map((producer) => this.getTile(producer.x, producer.y))]);
  }

  getActiveFireTiles() {
    if (this.activeFireTiles.size > 0) return this.activeFireTiles;
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.onFire) this.activeFireTiles.add(tile);
      }
    }
    return this.activeFireTiles;
  }

  getBiomeModifiers(biome = this.biome) {
    const modifiers = BIOME_CONFIG[biome] || {
      rockClusterScale: 1,
      forestClusterScale: 1,
      lakeCountMin: 0,
      lakeCountMax: TERRAIN_GENERATION_CONFIG.LAKE_COUNT_RANDOM_RANGE - 1,
      lakeRadiusScale: 1,
      riverMode: 'mixed',
    };
    return {
      ...modifiers,
      ...(this.biomeGenerationVersion >= 2 ? BIOME_TERRAIN_CONFIG[biome] : {}),
      ...(this.biomeGenerationVersion >= 3 ? BIOME_LAKE_CONFIG[biome] : {}),
    };
  }

  generateProceduralTerrain(biome = this.biome) {
    if (biome !== undefined) this.biome = biome;
    const modifiers = this.getBiomeModifiers(this.biome);
    // Mountains are painted first so the river can spring from high ground (it paints over the
    // rock, carving a valley), and the sea is computed before the river (but painted after it)
    // so river springs can be kept inland, away from the water they will eventually flow into.
    this.generateRockClusters(modifiers);
    this.prepareCoast();
    this.generateRiver(modifiers.riverMode);

    this.generateLakes(modifiers);
    this.freezeRiverBanks(modifiers);
    this.generateCoast();
    this.carveRiverMouths();
    this.orientRiverMouths();

    const mapScale = (this.width * this.height) / TERRAIN_GENERATION_CONFIG.MAP_SCALE_BASE_AREA;
    const numForestClusters = Math.round(
      TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_COUNT_SCALE * mapScale * (modifiers.forestClusterScale ?? 1),
    );
    for (let i = 0; i < numForestClusters; i++) {
      const margin = TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_CENTER_MARGIN;
      const cx = Math.floor(this.random() * (this.width - margin)) + margin / 2;
      const cy = Math.floor(this.random() * (this.height - margin)) + margin / 2;
      const radius = TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_BASE + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_RANDOM);
      this.paintTerrainCluster(cx, cy, radius, TERRAIN_TYPE.FOREST,
        TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_WOBBLE_RANGE,
        TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_WOBBLE_CENTER);
    }
  }

  // Rock is painted before the river so the channel can cut through a range instead of the range
  // appearing on top of it, which also leaves the mountain masses available as spring sites.
  generateRockClusters(modifiers = this.getBiomeModifiers()) {
    const mapScale = (this.width * this.height) / TERRAIN_GENERATION_CONFIG.MAP_SCALE_BASE_AREA;
    const numRockClusters = Math.round(
      TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_COUNT_SCALE * mapScale * (modifiers.rockClusterScale ?? 1),
    );
    for (let i = 0; i < numRockClusters; i++) {
      const margin = TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_CENTER_MARGIN;
      const cx = Math.floor(this.random() * (this.width - margin)) + margin / 2;
      const cy = Math.floor(this.random() * (this.height - margin)) + margin / 2;
      const radius = TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_BASE + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_RANDOM);
      this.paintTerrainCluster(cx, cy, radius * (modifiers.rockRadiusScale ?? 1), TERRAIN_TYPE.ROCK,
        TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_WOBBLE_RANGE,
        TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_WOBBLE_CENTER);
    }
    this.mountainSprings = this.collectMountainSprings();
    return numRockClusters;
  }

  // The interior point of every separate mountain mass, biggest first. A river with no land edge
  // to start on (a one-hex island, or a hex ringed by coastline) rises in the largest range.
  collectMountainSprings() {
    const seen = new Uint8Array(this.width * this.height);
    const masses = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const index = this.terrainKey(x, y);
        if (seen[index] || this.tiles[y][x].terrain !== TERRAIN_TYPE.ROCK) continue;
        seen[index] = 1;
        const tiles = [];
        const queue = [{ x, y }];
        while (queue.length > 0) {
          const current = queue.pop();
          tiles.push(current);
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = current.x + dx;
            const ny = current.y + dy;
            if (!this.isInBounds(nx, ny)) continue;
            const next = this.terrainKey(nx, ny);
            if (seen[next] || this.tiles[ny][nx].terrain !== TERRAIN_TYPE.ROCK) continue;
            seen[next] = 1;
            queue.push({ x: nx, y: ny });
          }
        }
        masses.push({ tiles, spring: this.getMassSpring(tiles) });
      }
    }
    masses.sort((a, b) => b.tiles.length - a.tiles.length ||
      a.spring.y - b.spring.y || a.spring.x - b.spring.x);
    return masses.map((mass) => mass.spring);
  }

  // The rock tile nearest the middle of the mass, so the spring sits in the heart of the range
  // rather than on a stray outcrop.
  getMassSpring(tiles) {
    let sumX = 0;
    let sumY = 0;
    for (const tile of tiles) {
      sumX += tile.x;
      sumY += tile.y;
    }
    const centerX = sumX / tiles.length;
    const centerY = sumY / tiles.length;
    let best = tiles[0];
    let bestDistance = (best.x - centerX) ** 2 + (best.y - centerY) ** 2;
    for (const tile of tiles) {
      const distance = (tile.x - centerX) ** 2 + (tile.y - centerY) ** 2;
      if (distance < bestDistance ||
          (distance === bestDistance && (tile.y < best.y || (tile.y === best.y && tile.x < best.x)))) {
        best = tile;
        bestDistance = distance;
      }
    }
    return { x: best.x, y: best.y };
  }

  // Paints the ocean side of a coastal city. Every ocean-facing hex edge becomes a
  // half-plane: salt water outside it, a beach of sand or rock inside it, ordinary
  // terrain beyond. Depths and beach widths are rolled per edge, so a hex that touches
  // ocean on two sides gets two different bands, and an island hex closes in from all six.
  // Turns the ocean-facing hex edges into the map-side half-planes to paint. Corners always
  // contribute; a side is added when that side edge is ocean or both of its corners are.
  getCoastAnchors() {
    const directions = new Set(this.coast);
    const names = new Set(this.coast);
    for (const { side, corners } of COAST_SIDE_PAIRS) {
      if (corners.every((corner) => directions.has(corner))) names.add(side);
    }
    return Array.from(names)
      .map((name) => COAST_EDGES[name])
      .filter(Boolean);
  }

  generateCoast() {
    const water = this.coastWater;
    if (!water) return 0;

    let painted = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (water[this.terrainKey(x, y)] !== 1) continue;
        const tile = this.tiles[y][x];
        tile.terrain = TERRAIN_TYPE.SALT_WATER;
        tile.riverFlowDir = null;
        painted++;
      }
    }
    if (painted === 0) return 0;

    // The beach is a dilation of the sea rather than another distance band: ring one is
    // always painted, ring two only where the noise agrees, so the strip is always solid
    // and one or two tiles thick even when the coastline steps sharply.
    const isWater = (x, y) => x >= 0 && x < this.width && y >= 0 && y < this.height &&
      water[this.terrainKey(x, y)] === 1;
    const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const ring = (inside) => {
      const found = [];
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (inside(x, y)) continue;
          if (neighbors.some(([dx, dy]) => inside(x + dx, y + dy))) found.push({ x, y });
        }
      }
      return found;
    };
    const paintBeach = ({ x, y }) => {
      const tile = this.tiles[y][x];
      if (this.biome === BIOME_TYPES.ARCTIC) {
        // An ice sheet has no sand: its shore is a broken shelf of ice and bare rock.
        const icy = coastNoise(this.seed + 2029, x, y, COAST_CONFIG.ROCK_PATCH_SCALE) < COAST_CONFIG.POLAR_ICE_CHANCE;
        tile.terrain = icy ? TERRAIN_TYPE.ICE : TERRAIN_TYPE.ROCK;
      } else {
        const wasRock = tile.terrain === TERRAIN_TYPE.ROCK;
        const rocky = wasRock ||
          coastNoise(this.seed + 5153, x, y, COAST_CONFIG.ROCK_PATCH_SCALE) < COAST_CONFIG.ROCK_BEACH_CHANCE;
        tile.terrain = rocky ? TERRAIN_TYPE.ROCK : TERRAIN_TYPE.SAND;
      }
      tile.riverFlowDir = null;
      painted++;
    };

    const firstRing = ring(isWater);
    const firstRingMask = new Uint8Array(this.width * this.height);
    for (const cell of firstRing) {
      // The shore is settled either way, but a river channel is left open so its mouth stays
      // attached to the sea instead of being walled off behind the beach.
      firstRingMask[this.terrainKey(cell.x, cell.y)] = 1;
      const terrain = this.tiles[cell.y][cell.x].terrain;
      if (terrain === TERRAIN_TYPE.RIVER || terrain === TERRAIN_TYPE.ICE) continue;
      paintBeach(cell);
    }
    const inFirstRing = (x, y) => x >= 0 && x < this.width && y >= 0 && y < this.height &&
      firstRingMask[this.terrainKey(x, y)] === 1;
    for (const cell of ring(inFirstRing)) {
      // A second-ring candidate may itself be sea (it is only excluded from the first ring),
      // and overwriting sea with beach would eat into the water.
      if (isWater(cell.x, cell.y)) continue;
      const secondRing = coastNoise(this.seed + 8123, cell.x, cell.y, COAST_CONFIG.ROCK_PATCH_SCALE) <
        COAST_CONFIG.SECOND_RING_CHANCE;
      if (!secondRing) continue;
      // Never cap a river channel: the mouth has to stay attached to the sea.
      const terrain = this.tiles[cell.y][cell.x].terrain;
      if (terrain === TERRAIN_TYPE.RIVER || terrain === TERRAIN_TYPE.ICE) continue;
      paintBeach(cell);
    }
    return painted;
  }

  // Works out where the sea will be without painting it, plus a distance field to the water.
  // The river is generated first and must keep its springs well inland, so it needs this map
  // before the coast is drawn.
  prepareCoast() {
    this.coastWater = null;
    this.seaDistance = null;
    if (this.coast.length === 0) return 0;
    const edges = this.getCoastAnchors()
      .map((edge) => ({
        ...edge,
        depth: COAST_CONFIG.MIN_DEPTH +
          Math.floor(this.random() * (COAST_CONFIG.MAX_DEPTH - COAST_CONFIG.MIN_DEPTH + 1)),
      }));
    if (edges.length === 0) return 0;

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const anchors = edges.map((edge) => ({
      x: edge.ax * this.width,
      y: edge.ay * this.height,
      nx: edge.nx,
      ny: edge.ny,
      depth: edge.depth,
    }));
    const water = new Uint8Array(this.width * this.height);
    let depth = 0;
    for (let y = 0; y < this.height; y++) {
      const relY = y + 0.5 - halfH;
      for (let x = 0; x < this.width; x++) {
        const relX = x + 0.5 - halfW;
        const wobble = (coastNoise(this.seed + 977, x, y, COAST_CONFIG.WOBBLE_SCALE) - 0.5) * 2 * COAST_CONFIG.WOBBLE;

        let bestDistance = -Infinity;
        for (const anchor of anchors) {
          const signed = (relX - anchor.x) * anchor.nx + (relY - anchor.y) * anchor.ny;
          const distance = signed + anchor.depth + wobble;
          if (distance > bestDistance) bestDistance = distance;
        }
        if (bestDistance < 0) continue;
        water[this.terrainKey(x, y)] = 1;
        depth++;
      }
    }
    if (depth === 0) return 0;

    this.coastWater = water;
    this.seaDistance = this.buildSeaDistance(water);
    return depth;
  }

  // Cheap BFS distance from every tile to the nearest sea tile, used to keep river springs away
  // from the coast. Capped so a landlocked tile simply reports a large number.
  buildSeaDistance(water) {
    const limit = 255;
    const distance = new Uint8Array(this.width * this.height);
    const queue = [];
    for (let index = 0; index < water.length; index++) {
      if (water[index] !== 1) continue;
      distance[index] = 0;
      queue.push(index);
    }
    let head = 0;
    while (head < queue.length) {
      const index = queue[head];
      head++;
      const current = distance[index];
      if (current >= limit) continue;
      const x = index % this.width;
      const y = (index - x) / this.width;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
        const nextIndex = ny * this.width + nx;
        if (water[nextIndex] === 1) continue;
        if (distance[nextIndex] !== 0) continue;
        distance[nextIndex] = current + 1;
        queue.push(nextIndex);
      }
    }
    return distance;
  }

  // A beach can still sit between a river and the sea when the path arrives diagonally, which
  // would leave the river ending behind a sand bar. Cut those tiles out so the mouth is open.
  carveRiverMouths() {
    if (this.coast.length === 0) return 0;
    const isSea = (tile) => tile?.terrain === TERRAIN_TYPE.SALT_WATER;
    const isRiver = (tile) => tile?.terrain === TERRAIN_TYPE.RIVER;
    let carved = 0;
    for (let pass = 0; pass < 2; pass++) {
      const targets = [];
      for (const tile of this.tiles.flat()) {
        if (tile.terrain !== TERRAIN_TYPE.SAND && tile.terrain !== TERRAIN_TYPE.ROCK) continue;
        const neighbors = this.getNeighbors8(tile.x, tile.y);
        if (neighbors.some(isSea) && neighbors.some(isRiver)) targets.push(tile);
      }
      for (const tile of targets) {
        tile.terrain = TERRAIN_TYPE.RIVER;
        carved++;
      }
      if (targets.length === 0) break;
    }
    return carved;
  }

  // A river that reaches the sea must run outward at that end. The traced path can wander on
  // its final approach, so every mouth tile is re-aimed at the water it is about to enter.
  orientRiverMouths() {
    if (this.coast.length === 0) return 0;
    const isSea = (tile) => tile?.terrain === TERRAIN_TYPE.SALT_WATER;
    let oriented = 0;
    for (const tile of this.tiles.flat()) {
      if (tile.terrain !== TERRAIN_TYPE.RIVER) continue;
      let vx = 0;
      let vy = 0;
      for (const neighbor of this.getNeighbors8(tile.x, tile.y)) {
        if (!isSea(neighbor)) continue;
        vx += Math.sign(neighbor.x - tile.x);
        vy += Math.sign(neighbor.y - tile.y);
      }
      if (vx === 0 && vy === 0) continue;
      const length = Math.hypot(vx, vy) || 1;
      tile.riverFlowDir = { x: vx / length, y: vy / length };
      oriented++;
    }
    return oriented;
  }

  paintTerrainCluster(cx, cy, radius, terrain, wobbleRange, wobbleCenter) {
    const irregular = this.generationVersion >= 2;
    const phase = irregular ? this.random() * Math.PI * 2 : 0;
    const secondaryPhase = irregular ? this.random() * Math.PI * 2 : 0;
    const extent = irregular ? Math.ceil(radius * 1.35) : radius;
    for (let y = Math.max(0, Math.ceil(cy - extent)); y <= Math.min(this.height - 1, Math.floor(cy + extent)); y++) {
      for (let x = Math.max(0, Math.ceil(cx - extent)); x <= Math.min(this.width - 1, Math.floor(cx + extent)); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const angle = irregular ? Math.atan2(dy, dx) : 0;
        const shape = irregular
          ? 1 + 0.2 * Math.sin(3 * angle + phase) + 0.12 * Math.cos(5 * angle + secondaryPhase)
          : 1;
        const dist = Math.sqrt(dx ** 2 + dy ** 2);
        if (dist <= radius * shape + (this.random() * wobbleRange - wobbleCenter)) {
          const tile = this.tiles[y][x];
          if (tile.terrain === TERRAIN_TYPE.EMPTY) tile.terrain = terrain;
        }
      }
    }
  }

  generateLakes(biome = this.getBiomeModifiers()) {
    const minLakes = biome.lakeCountMin ?? 0;
    const maxLakes = biome.lakeCountMax ?? (TERRAIN_GENERATION_CONFIG.LAKE_COUNT_RANDOM_RANGE - 1);
    const numLakes = minLakes + Math.floor(this.random() * (Math.max(0, maxLakes - minLakes) + 1));
    const radiusScale = biome.lakeRadiusScale ?? 1;
    // Polar lakes freeze right through, so they are painted as ice rather than water.
    const lakeTerrain = biome.frozenWater ? TERRAIN_TYPE.ICE : TERRAIN_TYPE.RIVER;
    for (let i = 0; i < numLakes; i++) {
      const radius = Math.max(1, Math.round(
        (TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_MIN + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_RANDOM_RANGE)) * radiusScale,
      ));
      const margin = radius + TERRAIN_GENERATION_CONFIG.LAKE_MARGIN_BUFFER;
      if (this.width <= margin * 2 || this.height <= margin * 2) continue;

      const cx = margin + Math.floor(this.random() * (this.width - margin * 2));
      const cy = margin + Math.floor(this.random() * (this.height - margin * 2));

      this.paintTerrainCluster(cx, cy, radius, lakeTerrain,
        TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_WOBBLE_RANGE,
        TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_WOBBLE_CENTER);
    }
  }

  // Anchor ice fringes the shallow banks of a polar river while the deep centre keeps flowing,
  // so only water tiles with few water neighbours can freeze. The open lane also keeps river
  // pollution flowing downstream and leaves somewhere to place a Water Tower or Sewage Plant.
  freezeRiverBanks(biome = this.getBiomeModifiers()) {
    if (!biome.frozenWater) return 0;
    const maxBankNeighbors = ICE_CONFIG.RIVER_BANK_MAX_WATER_NEIGHBORS;
    const chance = ICE_CONFIG.RIVER_BANK_ICE_CHANCE;
    const isOpenWater = (x, y) => this.getTile(x, y)?.terrain === TERRAIN_TYPE.RIVER;
    let frozen = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y][x];
        if (tile.terrain !== TERRAIN_TYPE.RIVER) continue;
        const openNeighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]]
          .filter(([dx, dy]) => isOpenWater(x + dx, y + dy)).length;
        if (openNeighbors > maxBankNeighbors) continue;
        if (this.random() >= chance) continue;
        tile.terrain = TERRAIN_TYPE.ICE;
        frozen++;
      }
    }
    return frozen;
  }

  // Where a river may leave the map when the city has a coast, as a map edge plus which half
  // of that edge the sea actually covers. Side coasts flood the whole matching edge; corner
  // coasts only flood a band around that corner, so their mouths stay pinned near the corner.
  getCoastalRiverMouths() {
    const mouths = [];
    for (const direction of this.coast) {
      for (const part of COAST_RIVER_MOUTHS[direction] || []) mouths.push(part);
    }
    return mouths;
  }

  /** An edge point guaranteed to sit in (or beside) the sea, so a river mouth flows outward. */
  getCoastalEdgePoint({ edge, half }) {
    const corner = Math.max(1, COAST_CONFIG.MIN_DEPTH - 1);
    const span = (size) => {
      if (half === 'full') {
        const margin = Math.max(
          TERRAIN_GENERATION_CONFIG.RIVER_EDGE_POINT_MARGIN_ABSOLUTE,
          Math.floor(size * TERRAIN_GENERATION_CONFIG.RIVER_EDGE_POINT_MARGIN_SCALE),
        );
        return [margin, size - margin];
      }
      return half === 'high' ? [size - 1 - corner, size - 1] : [0, corner];
    };
    const pick = (size) => {
      const [from, to] = span(size);
      const low = Math.max(0, Math.min(from, to));
      const high = Math.min(size - 1, Math.max(from, to));
      return low + Math.floor(this.random() * Math.max(1, high - low + 1));
    };
    switch (edge) {
      case 'top': return { edge, point: { x: pick(this.width), y: 0 } };
      case 'bottom': return { edge, point: { x: pick(this.width), y: this.height - 1 } };
      case 'left': return { edge, point: { x: 0, y: pick(this.height) } };
      case 'right': return { edge, point: { x: this.width - 1, y: pick(this.height) } };
      default: return null;
    }
  }

  generateRiver(riverMode = 'mixed') {
    if (riverMode === 'none') return;
    const edges = ['top', 'bottom', 'left', 'right'];
    const mouths = this.getCoastalRiverMouths();
    const coastalEdges = Array.from(new Set(mouths.map((mouth) => mouth.edge)));
    // Sources come from land so a river never starts in the sea. A hex whose every edge is
    // ocean (a one-hex island) has no land edge at all, so it springs from the biggest mass of
    // mountains instead and runs down to the coast.
    const sourceEdges = edges.filter((edge) => !coastalEdges.includes(edge));
    const mountainSprings = this.mountainSprings ?? this.collectMountainSprings();
    const triedSprings = new Set();
    const pickSourceEdge = (excluded = null) => {
      const pool = (sourceEdges.length > 0 ? sourceEdges : edges).filter((edge) => edge !== excluded);
      const list = pool.length > 0 ? pool : edges;
      return list[Math.floor(this.random() * list.length)];
    };
    const pickMouth = (excludedEdge = null) => {
      if (mouths.length === 0) return null;
      const pool = mouths.filter((mouth) => mouth.edge !== excludedEdge);
      const list = pool.length > 0 ? pool : mouths;
      return this.getCoastalEdgePoint(list[Math.floor(this.random() * list.length)]);
    };

    const marginX = Math.max(TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_ABSOLUTE, Math.floor(this.width * TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_SCALE));
    const marginY = Math.max(TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_ABSOLUTE, Math.floor(this.height * TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_SCALE));
    const inlandPoint = () => ({
      x: marginX + Math.floor(this.random() * (this.width - marginX * 2)),
      y: marginY + Math.floor(this.random() * (this.height - marginY * 2)),
    });
    const pickSource = (excluded = null) => {
      // A spring must sit well inland: never on a beach side, and never within
      // COAST_CONFIG.RIVER_SOURCE_MIN_SEA_DISTANCE tiles of the water it will flow into.
      const clearance = (point) => {
        if (!this.seaDistance) return Number.POSITIVE_INFINITY;
        return this.seaDistance[this.terrainKey(point.x, point.y)] ?? 0;
      };
      const minimum = COAST_CONFIG.RIVER_SOURCE_MIN_SEA_DISTANCE;
      const tried = [];
      const attempt = (candidate) => {
        tried.push(candidate);
        return clearance(candidate.point) >= minimum ? candidate : null;
      };

      const edgePool = (sourceEdges.length > 0 ? sourceEdges : edges).filter((edge) => edge !== excluded);
      const edgesToTry = edgePool.length > 0 ? edgePool : edges;
      for (let i = 0; i < 12; i++) {
        const edge = edgesToTry[Math.floor(this.random() * edgesToTry.length)];
        const accepted = attempt({ edge, point: this.getRandomEdgePoint(edge) });
        if (accepted) return accepted;
      }
      // No land edge is usable, so the spring rises in the largest mass of mountains: high ground
      // is where real springs sit. Masses are tried largest first and only one spring is taken
      // from each, so a forked river does not start twice in the same range.
      for (const spring of mountainSprings) {
        const key = `${spring.x},${spring.y}`;
        if (triedSprings.has(key)) continue;
        triedSprings.add(key);
        const accepted = attempt({ edge: excluded, point: spring });
        if (accepted) return accepted;
      }
      for (let i = 0; i < 12; i++) {
        const accepted = attempt({ edge: excluded, point: inlandPoint() });
        if (accepted) return accepted;
      }
      // Nothing on this hex is 50 tiles from the sea (a one-hex island reaches the coast from every
      // direction), so take the clearest option instead of looping. Mountains are tried first, so
      // the biggest range wins whenever it is as clear as anything else.
      return tried.reduce((best, candidate) => (
        clearance(candidate.point) > clearance(best.point) ? candidate : best
      ));
    };

    // Primary start and end. The downstream end always reaches the sea when there is a coast,
    // because the flow follows the path order: start -> end runs outward.
    const source1 = pickSource();
    this.riverSources = [source1.point];
    const startEdge1 = source1.edge;
    const mouth1 = pickMouth(startEdge1);
    const endEdge1 = mouth1 ? mouth1.edge : pickSourceEdge(startEdge1);

    const startPos1 = source1.point;
    const endPos1 = mouth1 ? mouth1.point : this.getRandomEdgePoint(endEdge1);

    // Pick interior junction point J
    const junction = inlandPoint();

    // Decide topology:
    // 40% Simple (1 start -> 1 end, no junction/3rd point)
    // 30% Fork (1 start -> 2 ends, with junction)
    // 30% Merge (2 starts -> 1 end, with junction)
    const mode = this.random();
    const forceForkMerge = riverMode === 'fork_merge';

    if (!forceForkMerge && mode < TERRAIN_GENERATION_CONFIG.RIVER_SIMPLE_PROBABILITY) {
      // SIMPLE: Direct path from Start1 to End1
      const path = this.traceRiverPath(startPos1, endPos1);
      this.paintRiverPath(path);
    } else if (mode < TERRAIN_GENERATION_CONFIG.RIVER_SIMPLE_PROBABILITY + TERRAIN_GENERATION_CONFIG.RIVER_FORK_PROBABILITY) {
      // FORK: 1 Start, 2 Ends meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      const path2 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path2);

      // 2nd End point: another coastal mouth when the hex has one, otherwise a remaining edge.
      const mouth2 = pickMouth(endEdge1);
      const remainingEdges = edges.filter((e) => e !== startEdge1 && e !== endEdge1);
      const endEdge2 = mouth2 ? mouth2.edge : (remainingEdges[Math.floor(this.random() * remainingEdges.length)] || endEdge1);
      const endPos2 = mouth2 ? mouth2.point : this.getRandomEdgePoint(endEdge2);

      const path3 = this.traceRiverPath(junction, endPos2);
      this.paintRiverPath(path3);
    } else {
      // MERGE: 2 Starts, 1 End meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      // 2nd Start point, preferring land so the source is not in the sea.
      const source2 = pickSource(endEdge1);
      this.riverSources.push(source2.point);
      const startEdge2 = source2.edge;
      const startPos2 = source2.point;

      const path2 = this.traceRiverPath(startPos2, junction);
      this.paintRiverPath(path2);

      const path3 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path3);
    }

    if (forceForkMerge) {
      const extraJunction = {
        x: marginX + Math.floor(this.random() * (this.width - marginX * 2)),
        y: marginY + Math.floor(this.random() * (this.height - marginY * 2)),
      };
      const extraMouth = pickMouth();
      const extraEdge = extraMouth ? extraMouth.edge : edges[Math.floor(this.random() * 4)];
      const extraEnd = extraMouth ? extraMouth.point : this.getRandomEdgePoint(extraEdge);
      this.paintRiverPath(this.traceRiverPath(junction, extraJunction));
      this.paintRiverPath(this.traceRiverPath(extraJunction, extraEnd));
    }
  }

  getRandomEdgePoint(edge) {
    const margin = Math.max(TERRAIN_GENERATION_CONFIG.RIVER_EDGE_POINT_MARGIN_ABSOLUTE, Math.floor(Math.min(this.width, this.height) * TERRAIN_GENERATION_CONFIG.RIVER_EDGE_POINT_MARGIN_SCALE));
    switch (edge) {
      case 'top':    return { x: margin + Math.floor(this.random() * (this.width - margin * 2)), y: 0 };
      case 'bottom': return { x: margin + Math.floor(this.random() * (this.width - margin * 2)), y: this.height - 1 };
      case 'left':   return { x: 0, y: margin + Math.floor(this.random() * (this.height - margin * 2)) };
      case 'right':  return { x: this.width - 1, y: margin + Math.floor(this.random() * (this.height - margin * 2)) };
    }
  }

  traceRiverPath(start, end) {
    const path = [{ x: start.x, y: start.y }];
    let x = start.x, y = start.y;
    const maxSteps = (this.width + this.height) * TERRAIN_GENERATION_CONFIG.RIVER_PATH_MAX_STEPS_MULTIPLIER;

    while (path.length < maxSteps) {
      const dx = end.x - x;
      const dy = end.y - y;

      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        if (dx !== 0 || dy !== 0) path.push({ x: end.x, y: end.y });
        break;
      }

      // 65% move toward target, 35% wander for organic look
      if (this.random() < TERRAIN_GENERATION_CONFIG.RIVER_PATH_TOWARD_TARGET_CHANCE) {
        if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && this.random() < TERRAIN_GENERATION_CONFIG.RIVER_PATH_TIE_BREAK_CHANCE)) {
          x += Math.sign(dx);
        } else {
          y += Math.sign(dy);
        }
      } else {
        // Perpendicular wander
        if (Math.abs(dx) >= Math.abs(dy)) {
          y += this.random() < TERRAIN_GENERATION_CONFIG.RIVER_PATH_TIE_BREAK_CHANCE ? -1 : 1;
        } else {
          x += this.random() < TERRAIN_GENERATION_CONFIG.RIVER_PATH_TIE_BREAK_CHANCE ? -1 : 1;
        }
      }

      x = Math.max(0, Math.min(this.width - 1, x));
      y = Math.max(0, Math.min(this.height - 1, y));

      path.push({ x, y });
    }

    return path;
  }

  paintRiverPath(path) {
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dirX = next.x - prev.x;
      const dirY = next.y - prev.y;
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      const dir = { x: dirX / len, y: dirY / len };

      this.paintRiverSegment(p.x, p.y, dir);
    }
  }

  paintRiverSegment(cx, cy, dir) {
    const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of offsets) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (this.isInBounds(nx, ny)) {
        const tile = this.tiles[ny][nx];
        tile.terrain = TERRAIN_TYPE.RIVER;
        if (!tile.riverFlowDir) {
          tile.riverFlowDir = dir;
        } else {
          // Smoothly blend directions at junctions
          const ax = tile.riverFlowDir.x + dir.x;
          const ay = tile.riverFlowDir.y + dir.y;
          const len = Math.sqrt(ax * ax + ay * ay) || 1;
          tile.riverFlowDir = { x: ax / len, y: ay / len };
        }
      }
    }
  }

  isInBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getTile(x, y) {
    if (!this.isInBounds(x, y)) return null;
    return this.tiles[y][x];
  }

  getActiveZonedTiles() {
    if (this.activeZonedTiles.size > 0) return this.activeZonedTiles;
    const manuallyAssignedZones = new Set();
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.zone !== ZONE.NONE) manuallyAssignedZones.add(tile);
      }
    }
    return manuallyAssignedZones;
  }

  getTerrainPercentages() {
    const counts = { water: 0, forest: 0, mountain: 0 };
    for (const row of this.tiles) {
      for (const tile of row) {
        // Frozen water and ocean water are still water for world-map statistics.
        if (tile.terrain === TERRAIN.WATER || tile.terrain === TERRAIN.ICE || tile.terrain === TERRAIN.SALT_WATER) counts.water++;
        else if (tile.terrain === TERRAIN.FOREST) counts.forest++;
        else if (tile.terrain === TERRAIN.MOUNTAIN) counts.mountain++;
      }
    }
    const total = this.width * this.height;
    return Object.fromEntries(Object.entries(counts).map(([terrain, count]) => [terrain, count / total * 100]));
  }

  getNeighbors(x, y) {
    const neighbors = [];
    const dirs = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    for (const d of dirs) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (this.isInBounds(nx, ny)) {
        neighbors.push(this.tiles[ny][nx]);
      }
    }
    return neighbors;
  }

  getNeighbors8(x, y) {
    const neighbors = [];
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
      { x: 0, y: 1 },  { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
    ];
    for (const d of dirs) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (this.isInBounds(nx, ny)) {
        neighbors.push(this.tiles[ny][nx]);
      }
    }
    return neighbors;
  }

  isRoadAdjacent(x, y) {
    const neighbors = this.getNeighbors(x, y);
    return neighbors.some((tile) => tile.hasRoad);
  }

  isWaterAdjacent(x, y) {
    const neighbors = this.getNeighbors(x, y);
    return neighbors.some((tile) => tile.terrain === TERRAIN_TYPE.RIVER);
  }

  // Salt water feeds only a Desalination Plant; pumps cannot drink it.
  isSaltWaterAdjacent(x, y) {
    const neighbors = this.getNeighbors(x, y);
    return neighbors.some((tile) => tile.terrain === TERRAIN_TYPE.SALT_WATER);
  }

  isBeachTile(x, y) {
    return this.getTile(x, y)?.terrain === TERRAIN_TYPE.SAND;
  }

  // True when any player-built tile (road, bridge, tunnel, zone, or building) lies inside
  // the square radius around (x, y). Used to decide whether a fire is close enough to the
  // player's city to justify an alert.
  hasPlayerDevelopmentWithin(x, y, radius) {
    const span = Math.max(0, Math.floor(Number(radius) || 0));
    const minX = Math.max(0, x - span);
    const maxX = Math.min(this.width - 1, x + span);
    const minY = Math.max(0, y - span);
    const maxY = Math.min(this.height - 1, y + span);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const tile = this.tiles[ty][tx];
        if (tile.hasRoad || tile.hasBridge || tile.hasTunnel || tile.zone !== ZONE.NONE || tile.producer) {
          return true;
        }
      }
    }
    return false;
  }

  // An Arctic ice sheet is solid water, so pumps and sewage plants can tap the meltwater
  // below it without touching an open river or lake. Other water-hungry buildings still
  // need water.
  hasMeltwaterAccess(producerType) {
    return this.biome === BIOME_TYPES.ARCTIC &&
      (producerType === PRODUCER_TYPE.WATER_TOWER || producerType === PRODUCER_TYPE.SEWAGE_PLANT);
  }

  // 'polluted' if any adjacent water is polluted, 'clean' if water is adjacent, otherwise null.
  // The sea counts: people like living beside any water, fresh or salt.
  getWaterfrontStatus(x, y) {
    const isWater = (tile) => tile.terrain === TERRAIN_TYPE.RIVER || tile.terrain === TERRAIN_TYPE.SALT_WATER;
    let status = null;
    for (const neighbor of this.getNeighbors(x, y)) {
      if (!isWater(neighbor)) continue;
      if (neighbor.isPolluted || neighbor.riverPollution > 0) return 'polluted';
      status = 'clean';
    }
    return status;
  }

  canPlaceRoad(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return isBuildableTerrain(tile.terrain) && !tile.destroyed && !tile.hasRoad && tile.zone === ZONE.NONE && !tile.producer;
  }

  canZone(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (!isBuildableTerrain(tile.terrain)) return false;
    if (tile.destroyed) return false;
    if (tile.hasRoad || tile.producer) return false;
    if (tile.zone !== ZONE.NONE) return false;
    return this.isRoadAdjacent(x, y);
  }

  canPlaceProducer(x, y, producerType) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    const config = PRODUCER_CONFIG[producerType];
    const isMine = Boolean(config?.requiresDiscoveredOre);
    if ((!isBuildableTerrain(tile.terrain) && (!isMine || tile.terrain === TERRAIN_TYPE.RIVER)) || tile.destroyed || tile.hasRoad || tile.zone !== ZONE.NONE || tile.producer) return false;

    if (config) {
        const saltOk = config.allowsSaltWater && this.isSaltWaterAdjacent(x, y);
        if (config.requiresWaterAdjacent && !this.isWaterAdjacent(x, y) && !this.hasMeltwaterAccess(producerType) && !saltOk) {
          return false;
        }
        if (config.requiresSaltWaterAdjacent && !this.isSaltWaterAdjacent(x, y)) {
          return false;
        }
        if (config.requiresDiscoveredOre && (
          !tile.oreDiscovered || tile.discoveredOre !== config.requiresDiscoveredOre
        )) {
          return false;
        }
        if (config.requiresBatteryAdjacent && !this.hasAdjacentBattery(x, y)) {
          return false;
        }
        if (config.unique && this.producers.some((p) => p.type === producerType)) {
          return false;
        }
      }
    return true;
  }

  hasAdjacentBattery(x, y) {
    return this.getNeighbors8(x, y).some((neighbor) => (
      neighbor.producer?.type === PRODUCER_TYPE.BATTERY
    ));
  }

  // Player-facing rule: buildings need road access; renewables connect through their battery instead.
  canBuildProducer(x, y, producerType) {
    if (!this.canPlaceProducer(x, y, producerType)) return false;
    if (producerType === PRODUCER_TYPE.WINDMILL || producerType === PRODUCER_TYPE.SOLAR_PANEL) return true;
    return this.isRoadAdjacent(x, y);
  }

  /**
   * True when bulldozing would actually change the tile. Wrecked road rubble counts: the
   * player clears it here before rebuilding. Kept in step with `bulldoze`.
   */
  canBulldoze(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return Boolean(
      tile.destroyed ||
      tile.roadDamage ||
      tile.hasRoad ||
      tile.hasBridge ||
      tile.hasTunnel ||
      tile.producer ||
      tile.zone !== ZONE.NONE ||
      tile.terrain === TERRAIN_TYPE.FOREST
    );
  }

  canBuildTool(x, y, tool) {
    if (!tool) return false;
    if (tool === 'road') return this.canPlaceRoad(x, y);
    if (tool === 'bridge') return this.canPlaceBridge(x, y);
    if (tool === 'tunnel') return this.canPlaceTunnel(x, y);
    if (tool === 'survey') return this.canSurvey(x, y);
    if (tool === 'bulldoze') return this.canBulldoze(x, y);
    if (tool.startsWith('zone_')) return this.canZone(x, y);
    const producerType = producerTypeForTool(tool);
    return producerType ? this.canBuildProducer(x, y, producerType) : false;
  }

  placeRoad(x, y) {
    if (!this.canPlaceRoad(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.hasRoad = true;
    tile.roadDamage = 0;
    this.activeRoadTiles.add(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  canPlaceTunnel(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return tile.terrain === TERRAIN.MOUNTAIN && !tile.destroyed && !tile.hasRoad && !tile.hasBridge && !tile.hasTunnel && tile.zone === ZONE.NONE && !tile.producer;
  }

  placeTunnel(x, y) {
    if (!this.canPlaceTunnel(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.hasTunnel = true;
    tile.hasRoad = true;
    tile.roadDamage = 0;
    this.activeRoadTiles.add(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  placeZone(x, y, zoneType) {
    if (!this.canZone(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.zone = zoneType;
    tile.density = DENSITY.LIGHT;
    tile.growthScore = 0;
    this.activeZonedTiles.add(tile);
    this.fireCandidateTiles.add(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  // Upgrades are always purchasable; reaching capacity is now only informational and
  // drives the "full" marker on the tile.
  canUpgradeZone(tile) {
    return Boolean(
      tile &&
      this.activeZonedTiles.has(tile) &&
      !tile.destroyed &&
      [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.AGRICULTURAL].includes(tile.zone) &&
      tile.density !== DENSITY.HIGH
    );
  }

  canUpgradeProducer(tile) {
    const producer = tile?.producer;
    if (!producer || tile.destroyed) return false;
    if (!isTieredProducer(producer.type)) return false;
    return getProducerTier(producer) < PRODUCER_TIER_MAX;
  }

  upgradeProducer(tile) {
    if (!this.canUpgradeProducer(tile)) return false;
    const producer = tile.producer;
    const nextTier = clampTier(getProducerTier(producer) + 1);
    producer.tier = nextTier;

    if (producer.type === PRODUCER_TYPE.BATTERY) {
      producer.maxStorage = getBatteryStorageForTier(nextTier);
      producer.storedEnergy = Math.min(producer.storedEnergy || 0, producer.maxStorage);
      producer.capacity = 0;
    } else if (producer.type === PRODUCER_TYPE.WINDMILL) {
      producer.peakCapacity = getWindPeakForTier(nextTier);
      producer.capacity = 0;
    } else if (producer.type === PRODUCER_TYPE.SOLAR_PANEL) {
      producer.peakCapacity = getSolarPeakForTier(nextTier);
      producer.capacity = 0;
    } else if (producer.type === PRODUCER_TYPE.WATER_TOWER) {
      producer.capacity = getWaterCapacityForTier(nextTier);
    } else if (producer.type === PRODUCER_TYPE.SEWAGE_PLANT) {
      producer.capacity = getSewageCapacityForTier(nextTier);
    } else {
      producer.density = TIER_DENSITY[nextTier - 1];
      producer.totalJobs = Math.min(producer.totalJobs || 0, getServiceTierStat('maxStaff', nextTier));
      producer.filledJobs = Math.min(producer.filledJobs || 0, producer.totalJobs);
    }

    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  upgradeZone(tile) {
    if (!this.canUpgradeZone(tile)) return false;
    tile.density = tile.density === DENSITY.LIGHT ? DENSITY.MEDIUM : DENSITY.HIGH;
    if (tile.zone === ZONE.RESIDENTIAL) {
      const capacity = RESIDENTIAL_CAPACITY[tile.density] || 0;
      const progress = Math.min(1, Math.max(0, (tile.population || 0) / capacity));
      const score = tile.density === DENSITY.MEDIUM
        ? GROWTH_CONFIG.THRESHOLD_MEDIUM + progress * (GROWTH_CONFIG.THRESHOLD_HIGH - GROWTH_CONFIG.THRESHOLD_MEDIUM)
        : GROWTH_CONFIG.THRESHOLD_HIGH + progress * (GROWTH_CONFIG.MAX_SCORE - GROWTH_CONFIG.THRESHOLD_HIGH);
      tile.growthScore = Math.round(score * 100) / 100;
    }
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  placeProducer(x, y, producerType, capacity, tier = 1) {
    if (!this.canPlaceProducer(x, y, producerType)) return null;
    const tile = this.getTile(x, y);
    const resolvedTier = clampTier(tier);
    const producer = {
      id: this.nextProducerId++,
      type: producerType,
      tier: resolvedTier,
      capacity: capacity ?? 0,
      usedCapacity: 0,
      contaminated: false,
      utilityShortfall: { power: false, water: false, sewage: false },
      utilityFailureTicks: 0,
      operational: true,
      surveyTarget: null,
      surveyProgress: 0,
      surveyRequired: 0,
      budget: SERVICE_GLOBAL_CONFIG.BUDGET_MAX_VALUE,
      // Only a Smelter runs a recipe. Null means "not applicable", and for a Smelter it
      // means All Evenly, which is also the default the inspector presents.
      recipe: null,
      storageType: PRODUCER_CONFIG[producerType]?.defaultStorageType || null,
      x,
      y,
    };
    if (producerType === PRODUCER_TYPE.BATTERY) {
      producer.maxStorage = capacity > 0 ? capacity : getBatteryStorageForTier(resolvedTier);
      producer.storedEnergy = 0;
      producer.capacity = 0;
    }
    if (producerType === PRODUCER_TYPE.WINDMILL || producerType === PRODUCER_TYPE.SOLAR_PANEL) {
      const defaultPeak = producerType === PRODUCER_TYPE.WINDMILL
        ? getWindPeakForTier(resolvedTier)
        : getSolarPeakForTier(resolvedTier);
      producer.peakCapacity = capacity > 0 ? capacity : defaultPeak;
      producer.capacity = 0;
      producer.hasBatteryConnection = this.hasAdjacentBattery(x, y);
    }
    if (producerType === PRODUCER_TYPE.WATER_TOWER) {
      // An explicit capacity (including 0, as some tests use) wins over the tier default.
      producer.capacity = capacity == null ? getWaterCapacityForTier(resolvedTier) : capacity;
    }
    if (producerType === PRODUCER_TYPE.SEWAGE_PLANT) {
      producer.capacity = capacity == null ? getSewageCapacityForTier(resolvedTier) : capacity;
    }
    if (producerType === PRODUCER_TYPE.DESALINATION_PLANT) {
      producer.capacity = capacity == null ? PRODUCER_CONFIG[producerType].capacity : capacity;
    }
    if (isTieredService(producerType)) {
      producer.filledJobs = 0;
      producer.totalJobs = 0;
      producer.density = TIER_DENSITY[resolvedTier - 1];
      producer.patients = 0;
      producer.prisoners = 0;
      producer.prisonerTimers = [];
    }
    tile.producer = producer;
    this.producers.push(producer);
    this.fireCandidateTiles.add(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return producer;
  }

  canSurvey(x, y) {
    // Arctic ice sheets are bare: there is nothing buried to find, so surveying is unavailable.
    if (this.biome === BIOME_TYPES.ARCTIC) return false;
    const tile = this.getTile(x, y);
    if (!tile || tile.producer || tile.hasRoad || tile.oreDiscovered || tile.surveyingBy) return false;
    if (tile.terrain === TERRAIN.WATER || tile.terrain === TERRAIN.SALT_WATER) return false;
    return tile.terrain !== TERRAIN.MOUNTAIN || !this.isMountainSurveyEnclosed(x, y);
  }

  isMountainSurveyEnclosed(x, y) {
    const neighbors = this.getNeighbors(x, y);
    return neighbors.length === 4 && neighbors.every((neighbor) => (
      neighbor.terrain === TERRAIN.MOUNTAIN && !neighbor.hasTunnel
    ));
  }

  startSurvey(x, y) {
    if (!this.canSurvey(x, y)) return false;
    const surveyors = this.producers.filter((producer) => (
      producer.type === 'survey_station' && producer.operational && !producer.surveyTarget
    ));
    const target = this.getTile(x, y);
    const surveyor = surveyors.find((producer) => this.isRoadAdjacent(producer.x, producer.y));
    if (!target || !surveyor) return false;

    surveyor.surveyTarget = { x, y };
    surveyor.surveyProgress = 0;
    const surveyDuration = PRODUCER_CONFIG[PRODUCER_TYPE.SURVEY_STATION].surveyDuration;
    surveyor.surveyRequired = target.terrain === TERRAIN.MOUNTAIN ? surveyDuration.mountain : surveyDuration.standard;
    target.surveyingBy = surveyor.id;
    target.surveyProgress = 0;
    target.surveyRequired = surveyor.surveyRequired;
    return true;
  }

  cancelSurvey(surveyor) {
    if (!surveyor?.surveyTarget) return false;
    const target = this.getTile(surveyor.surveyTarget.x, surveyor.surveyTarget.y);
    if (target?.surveyingBy === surveyor.id) {
      target.surveyingBy = null;
      target.surveyProgress = 0;
      target.surveyRequired = 0;
    }
    surveyor.surveyTarget = null;
    surveyor.surveyProgress = 0;
    surveyor.surveyRequired = 0;
    return true;
  }

  // Bridges cross open water and frozen water alike: ice is solid enough to build on.
  // Bridges cross open water, frozen water, and the sea, but a single bridge may not be longer
  // than COAST_CONFIG.BRIDGE_MAX_TILES tiles, so a wide lake still needs a different route.
  canPlaceBridge(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    const isCrossable = tile.terrain === TERRAIN_TYPE.RIVER ||
      tile.terrain === TERRAIN_TYPE.ICE ||
      tile.terrain === TERRAIN_TYPE.SALT_WATER;
    if (!isCrossable || tile.hasBridge) return false;
    return this.bridgeRunLength(x, y) <= COAST_CONFIG.BRIDGE_MAX_TILES;
  }

  // Length of the bridge run that would include (x, y): the connected span of already-built
  // bridge tiles plus this one. The limit therefore caps how far a single crossing can reach.
  bridgeRunLength(x, y) {
    const start = this.getTile(x, y);
    if (!start) return 0;
    const limit = COAST_CONFIG.BRIDGE_MAX_TILES + 1;
    const seen = new Set([this.terrainKey(x, y)]);
    const queue = [start];
    while (queue.length > 0 && seen.size < limit) {
      const current = queue.shift();
      for (const neighbor of this.getNeighbors8(current.x, current.y)) {
        if (!neighbor.hasBridge) continue;
        const key = this.terrainKey(neighbor.x, neighbor.y);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push(neighbor);
        if (seen.size >= limit) break;
      }
    }
    return seen.size;
  }

  placeBridge(x, y) {
    if (!this.canPlaceBridge(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.hasBridge = true;
    tile.hasRoad = true;
    tile.roadDamage = 0;
    this.activeRoadTiles.add(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  bulldoze(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;

    let modified = false;
    if (tile.destroyed) {
      tile.destroyed = false;
      modified = true;
    }
    if (tile.roadDamage) {
      tile.roadDamage = 0;
      modified = true;
    }
    if (tile.hasBridge) {
      tile.hasBridge = false;
      tile.hasRoad = false;
      this.activeRoadTiles.delete(tile);
      modified = true;
    }
    if (tile.hasTunnel) {
      tile.hasTunnel = false;
      tile.hasRoad = false;
      this.activeRoadTiles.delete(tile);
      modified = true;
    }
    if (tile.terrain === TERRAIN_TYPE.FOREST) {
      tile.terrain = TERRAIN_TYPE.EMPTY;
      this.markTerrainChanged(x, y);
      this.fireCandidateTiles.delete(tile);
      this.pollutionDirty = true;
      modified = true;
    }
    if (tile.producer) {
      if (tile.producer.surveyTarget) {
        const target = this.getTile(tile.producer.surveyTarget.x, tile.producer.surveyTarget.y);
        if (target?.surveyingBy === tile.producer.id) {
          target.surveyingBy = null;
          target.surveyProgress = 0;
          target.surveyRequired = 0;
        }
      }
      this.producers = this.producers.filter((p) => p.id !== tile.producer.id);
      tile.producer = null;
      this.fireCandidateTiles.delete(tile);
      this.pollutionDirty = true;
      modified = true;
    }
    if (tile.hasRoad) {
      tile.hasRoad = false;
      this.activeRoadTiles.delete(tile);
      modified = true;
    }
    if (tile.zone !== ZONE.NONE) {
      tile.zone = ZONE.NONE;
      tile.density = DENSITY.LIGHT;
      tile.growthScore = 0;
      tile.relocatedPopulation = 0;
      tile.fireDisplacedPopulation = 0;
      tile.populationLoss = 0;
      tile.fireRepair = 1;
      tile.shortfall = { power: false, water: false, sewage: false };
      this.activeZonedTiles.delete(tile);
      this.fireCandidateTiles.delete(tile);
      this.repairingTiles.delete(tile);
      this.pollutionDirty = true;
      modified = true;
    }
    if (modified) this.coverageVersion++;
    return modified;
  }

  damageRoad(tile, amount) {
    if (!tile || !tile.hasRoad || tile.destroyed || amount <= 0) return false;
    tile.roadDamage = Math.min(100, (tile.roadDamage || 0) + amount);
    if (tile.roadDamage < 100) return false;
    tile.hasRoad = false;
    tile.hasBridge = false;
    tile.hasTunnel = false;
    tile.destroyed = true;
    this.activeRoadTiles.delete(tile);
    this.coverageVersion++;
    this.pollutionDirty = true;
    return true;
  }

  /**
   * Restores a worn road tile to pristine. Damage alone never affects pathing, so this
   * does not invalidate coverage. Wrecked tiles are not repairable this way; they stay as
   * rubble until the player bulldozes and rebuilds them.
   */
  repairRoad(tile) {
    if (!tile || !tile.hasRoad || tile.destroyed || !tile.roadDamage) return false;
    tile.roadDamage = 0;
    return true;
  }
}
