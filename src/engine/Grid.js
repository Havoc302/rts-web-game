import { TERRAIN, TERRAIN_TYPE, ZONE, DENSITY, MAP_WIDTH, MAP_HEIGHT, PRODUCER_CONFIG, PRODUCER_TYPE, ORE_CONFIG, ORE_GENERATION, SERVICE_GLOBAL_CONFIG, TERRAIN_GENERATION_CONFIG } from '../config.js';

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
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT, seed = null) {
    this.width = width;
    this.height = height;
    this.seed = seed !== null ? parseInt(seed, 10) : this.getInitialSeed();
    this.random = createPRNG(this.seed);
    this.tiles = [];
    this.producers = [];
    this.nextProducerId = 1;
    this.terrainVersion = 0;

    this.initGrid();
  }

  getInitialSeed() {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const paramSeed = parseInt(urlParams.get('seed'), 10);
      if (!isNaN(paramSeed) && paramSeed > 0) return paramSeed;

      const savedSeed = parseInt(localStorage.getItem('metropolis_map_seed'), 10);
      if (!isNaN(savedSeed) && savedSeed > 0) return savedSeed;
    }
    const newSeed = Math.floor(Math.random() * TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MAX) + TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MIN;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('metropolis_map_seed', newSeed);
    }
    return newSeed;
  }

  initGrid() {
    this.randomizeGrid(this.seed);
  }

  randomizeGrid(seed = null) {
    if (seed !== null && !isNaN(parseInt(seed, 10))) {
      this.seed = parseInt(seed, 10);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('metropolis_map_seed', this.seed);
    }
    this.random = createPRNG(this.seed);
    this.terrainVersion++;

    this.tiles = [];
    this.producers = [];
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        row.push(this.createDefaultTile(x, y));
      }
      this.tiles.push(row);
    }

    this.generateProceduralTerrain();
    this.generateHiddenOres();
  }

  generateHiddenOres() {
    const oreTypes = Object.keys(ORE_CONFIG);
    for (const row of this.tiles) {
      for (const tile of row) {
        if (this.random() >= (ORE_GENERATION[tile.terrain] || 0)) continue;
        tile.ore = oreTypes[Math.floor(this.random() * oreTypes.length)];
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
      zone: ZONE.NONE,
      density: DENSITY.LIGHT,
      growthScore: 0,
      relocatedPopulation: 0,
      fireDisplacedPopulation: 0,
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
      crime: 0,
      onFire: false,
      fireDamage: 0,
      destroyed: false,
    };
  }

  generateProceduralTerrain() {
    // 1. Generate river(s) with random start/end edges and optional fork
    this.generateRiver();

    // 1b. Scatter 0-5 lakes of varying size
    this.generateLakes();

    // 2. Scatter Forest Clusters — scaled to map area
    const mapScale = (this.width * this.height) / TERRAIN_GENERATION_CONFIG.MAP_SCALE_BASE_AREA;
    const numForestClusters = Math.round(TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_COUNT_SCALE * mapScale);
    for (let i = 0; i < numForestClusters; i++) {
      const margin = TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_CENTER_MARGIN;
      const cx = Math.floor(this.random() * (this.width - margin)) + margin / 2;
      const cy = Math.floor(this.random() * (this.height - margin)) + margin / 2;
      const radius = TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_BASE + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_RANDOM);

      for (let y = Math.max(0, cy - radius); y <= Math.min(this.height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(this.width - 1, cx + radius); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius + (this.random() * TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_WOBBLE_RANGE - TERRAIN_GENERATION_CONFIG.FOREST_CLUSTER_RADIUS_WOBBLE_CENTER)) {
            const tile = this.tiles[y][x];
            if (tile.terrain === TERRAIN_TYPE.EMPTY) {
              tile.terrain = TERRAIN_TYPE.FOREST;
            }
          }
        }
      }
    }

    // 3. Scatter Rock Clusters — scaled to map area
    const numRockClusters = Math.round(TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_COUNT_SCALE * mapScale);
    for (let i = 0; i < numRockClusters; i++) {
      const margin = TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_CENTER_MARGIN;
      const cx = Math.floor(this.random() * (this.width - margin)) + margin / 2;
      const cy = Math.floor(this.random() * (this.height - margin)) + margin / 2;
      const radius = TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_BASE + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_RANDOM);

      for (let y = Math.max(0, cy - radius); y <= Math.min(this.height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(this.width - 1, cx + radius); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius + (this.random() * TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_WOBBLE_RANGE - TERRAIN_GENERATION_CONFIG.ROCK_CLUSTER_RADIUS_WOBBLE_CENTER)) {
            const tile = this.tiles[y][x];
            if (tile.terrain === TERRAIN_TYPE.EMPTY) {
              tile.terrain = TERRAIN_TYPE.ROCK;
            }
          }
        }
      }
    }
  }

  generateLakes() {
    const numLakes = Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.LAKE_COUNT_RANDOM_RANGE); // 0-5 lakes
    for (let i = 0; i < numLakes; i++) {
      const radius = TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_MIN + Math.floor(this.random() * TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_RANDOM_RANGE);
      const margin = radius + TERRAIN_GENERATION_CONFIG.LAKE_MARGIN_BUFFER;
      if (this.width <= margin * 2 || this.height <= margin * 2) continue;

      const cx = margin + Math.floor(this.random() * (this.width - margin * 2));
      const cy = margin + Math.floor(this.random() * (this.height - margin * 2));

      for (let y = Math.max(0, cy - radius); y <= Math.min(this.height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(this.width - 1, cx + radius); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius + (this.random() * TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_WOBBLE_RANGE - TERRAIN_GENERATION_CONFIG.LAKE_RADIUS_WOBBLE_CENTER)) {
            const tile = this.tiles[y][x];
            if (tile.terrain === TERRAIN_TYPE.EMPTY) {
              tile.terrain = TERRAIN_TYPE.RIVER;
            }
          }
        }
      }
    }
  }

  generateRiver() {
    const edges = ['top', 'bottom', 'left', 'right'];

    // Primary start and end edges
    const startEdge1 = edges[Math.floor(this.random() * 4)];
    let endEdge1;
    do {
      endEdge1 = edges[Math.floor(this.random() * 4)];
    } while (endEdge1 === startEdge1);

    const startPos1 = this.getRandomEdgePoint(startEdge1);
    const endPos1 = this.getRandomEdgePoint(endEdge1);

    // Pick interior junction point J
    const marginX = Math.max(TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_ABSOLUTE, Math.floor(this.width * TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_SCALE));
    const marginY = Math.max(TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_ABSOLUTE, Math.floor(this.height * TERRAIN_GENERATION_CONFIG.RIVER_MARGIN_SCALE));
    const junction = {
      x: marginX + Math.floor(this.random() * (this.width - marginX * 2)),
      y: marginY + Math.floor(this.random() * (this.height - marginY * 2)),
    };

    // Decide topology:
    // 40% Simple (1 start -> 1 end, no junction/3rd point)
    // 30% Fork (1 start -> 2 ends, with junction)
    // 30% Merge (2 starts -> 1 end, with junction)
    const mode = this.random();

    if (mode < TERRAIN_GENERATION_CONFIG.RIVER_SIMPLE_PROBABILITY) {
      // SIMPLE: Direct path from Start1 to End1
      const path = this.traceRiverPath(startPos1, endPos1);
      this.paintRiverPath(path);
    } else if (mode < TERRAIN_GENERATION_CONFIG.RIVER_SIMPLE_PROBABILITY + TERRAIN_GENERATION_CONFIG.RIVER_FORK_PROBABILITY) {
      // FORK: 1 Start, 2 Ends meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      const path2 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path2);

      // 2nd End point on a remaining edge
      const remainingEdges = edges.filter((e) => e !== startEdge1 && e !== endEdge1);
      const endEdge2 = remainingEdges[Math.floor(this.random() * remainingEdges.length)] || endEdge1;
      const endPos2 = this.getRandomEdgePoint(endEdge2);

      const path3 = this.traceRiverPath(junction, endPos2);
      this.paintRiverPath(path3);
    } else {
      // MERGE: 2 Starts, 1 End meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      // 2nd Start point on a remaining edge
      const remainingEdges = edges.filter((e) => e !== startEdge1 && e !== endEdge1);
      const startEdge2 = remainingEdges[Math.floor(this.random() * remainingEdges.length)] || startEdge1;
      const startPos2 = this.getRandomEdgePoint(startEdge2);

      const path2 = this.traceRiverPath(startPos2, junction);
      this.paintRiverPath(path2);

      const path3 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path3);
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

  canPlaceRoad(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return tile.terrain === TERRAIN_TYPE.EMPTY && !tile.destroyed && !tile.hasRoad && tile.zone === ZONE.NONE && !tile.producer;
  }

  canZone(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain !== TERRAIN_TYPE.EMPTY) return false;
    if (tile.destroyed) return false;
    if (tile.hasRoad || tile.producer) return false;
    if (tile.zone !== ZONE.NONE) return false;
    return this.isRoadAdjacent(x, y);
  }

  canPlaceProducer(x, y, producerType) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain !== TERRAIN_TYPE.EMPTY || tile.destroyed || tile.hasRoad || tile.zone !== ZONE.NONE || tile.producer) return false;

    if (producerType) {
      const config = PRODUCER_CONFIG[producerType];
      if (config) {
        if (config.requiresWaterAdjacent && !this.isWaterAdjacent(x, y)) {
          return false;
        }
        if (config.requiresBatteryAdjacent && !this.hasAdjacentBattery(x, y)) {
          return false;
        }
        if (config.unique && this.producers.some((p) => p.type === producerType)) {
          return false;
        }
      }
    }
    return true;
  }

  hasAdjacentBattery(x, y) {
    return this.getNeighbors8(x, y).some((neighbor) => (
      neighbor.producer?.type === PRODUCER_TYPE.BATTERY
    ));
  }

  placeRoad(x, y) {
    if (!this.canPlaceRoad(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.hasRoad = true;
    return true;
  }

  placeZone(x, y, zoneType) {
    if (!this.canZone(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.zone = zoneType;
    tile.density = DENSITY.LIGHT;
    tile.growthScore = 0;
    return true;
  }

  placeProducer(x, y, producerType, capacity) {
    if (!this.canPlaceProducer(x, y, producerType)) return null;
    const tile = this.getTile(x, y);
    const producer = {
      id: this.nextProducerId++,
      type: producerType,
      capacity,
      usedCapacity: 0,
      contaminated: false,
      utilityShortfall: { power: false, water: false, sewage: false },
      utilityFailureTicks: 0,
      operational: true,
      surveyTarget: null,
      surveyProgress: 0,
      surveyRequired: 0,
      budget: SERVICE_GLOBAL_CONFIG.BUDGET_MAX_VALUE,
      x,
      y,
    };
    if (producerType === PRODUCER_TYPE.BATTERY) {
      producer.maxStorage = capacity;
      producer.storedEnergy = 0;
      producer.capacity = 0;
    }
    tile.producer = producer;
    this.producers.push(producer);
    return producer;
  }

  canSurvey(x, y) {
    const tile = this.getTile(x, y);
    return Boolean(tile && !tile.producer && !tile.hasRoad && !tile.oreDiscovered && !tile.surveyingBy);
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

  canPlaceBridge(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    return tile.terrain === TERRAIN_TYPE.RIVER && !tile.hasBridge;
  }

  placeBridge(x, y) {
    if (!this.canPlaceBridge(x, y)) return false;
    const tile = this.getTile(x, y);
    tile.hasBridge = true;
    tile.hasRoad = true;
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
    if (tile.hasBridge) {
      tile.hasBridge = false;
      tile.hasRoad = false;
      modified = true;
    }
    if (tile.terrain === TERRAIN_TYPE.FOREST) {
      tile.terrain = TERRAIN_TYPE.EMPTY;
      this.terrainVersion++;
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
      modified = true;
    }
    if (tile.hasRoad) {
      tile.hasRoad = false;
      modified = true;
    }
    if (tile.zone !== ZONE.NONE) {
      tile.zone = ZONE.NONE;
      tile.density = DENSITY.LIGHT;
      tile.growthScore = 0;
      tile.relocatedPopulation = 0;
      tile.fireDisplacedPopulation = 0;
      tile.shortfall = { power: false, water: false, sewage: false };
      modified = true;
    }
    return modified;
  }
}
