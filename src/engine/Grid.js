import { TERRAIN, TERRAIN_TYPE, ZONE, DENSITY, MAP_WIDTH, MAP_HEIGHT, PRODUCER_CONFIG } from '../config.js';

export class Grid {
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.producers = [];
    this.nextProducerId = 1;

    this.initGrid();
  }

  initGrid() {
    this.randomizeGrid();
  }

  randomizeGrid() {
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
    this.computeRiverFlowOrder();
  }

  createDefaultTile(x, y) {
    return {
      x,
      y,
      terrain: TERRAIN_TYPE.EMPTY,
      hasRoad: false,
      zone: ZONE.NONE,
      density: DENSITY.LIGHT,
      growthScore: 0,
      producer: null,
      shortfall: { power: false, water: false, sewage: false },
      connected: false,
      distanceToProducer: { power: Infinity, water: Infinity, sewage: Infinity },
      pollution: 0,
      riverFlowOrder: null,
      riverFlowDir: null,
    };
  }

  generateProceduralTerrain() {
    // 1. Generate river(s) with random start/end edges and optional fork
    this.generateRiver();

    // 2. Scatter Forest Clusters — scaled to map area
    const mapScale = (this.width * this.height) / 900;
    const numForestClusters = Math.round(6 * mapScale);
    for (let i = 0; i < numForestClusters; i++) {
      const cx = Math.floor(Math.random() * (this.width - 4)) + 2;
      const cy = Math.floor(Math.random() * (this.height - 4)) + 2;
      const radius = 3 + Math.floor(Math.random() * 5);

      for (let y = Math.max(0, cy - radius); y <= Math.min(this.height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(this.width - 1, cx + radius); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius + (Math.random() * 0.8 - 0.4)) {
            const tile = this.tiles[y][x];
            if (tile.terrain === TERRAIN_TYPE.EMPTY) {
              tile.terrain = TERRAIN_TYPE.FOREST;
            }
          }
        }
      }
    }

    // 3. Scatter Rock Clusters — scaled to map area
    const numRockClusters = Math.round(4 * mapScale);
    for (let i = 0; i < numRockClusters; i++) {
      const cx = Math.floor(Math.random() * (this.width - 4)) + 2;
      const cy = Math.floor(Math.random() * (this.height - 4)) + 2;
      const radius = 2 + Math.floor(Math.random() * 4);

      for (let y = Math.max(0, cy - radius); y <= Math.min(this.height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(this.width - 1, cx + radius); x++) {
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist <= radius + (Math.random() * 0.6 - 0.3)) {
            const tile = this.tiles[y][x];
            if (tile.terrain === TERRAIN_TYPE.EMPTY) {
              tile.terrain = TERRAIN_TYPE.ROCK;
            }
          }
        }
      }
    }
  }

  generateRiver() {
    const edges = ['top', 'bottom', 'left', 'right'];

    // Primary start and end edges
    const startEdge1 = edges[Math.floor(Math.random() * 4)];
    let endEdge1;
    do {
      endEdge1 = edges[Math.floor(Math.random() * 4)];
    } while (endEdge1 === startEdge1);

    const startPos1 = this.getRandomEdgePoint(startEdge1);
    const endPos1 = this.getRandomEdgePoint(endEdge1);

    // Pick interior junction point J
    const marginX = Math.max(5, Math.floor(this.width * 0.25));
    const marginY = Math.max(5, Math.floor(this.height * 0.25));
    const junction = {
      x: marginX + Math.floor(Math.random() * (this.width - marginX * 2)),
      y: marginY + Math.floor(Math.random() * (this.height - marginY * 2)),
    };

    // Decide topology:
    // 40% Simple (1 start -> 1 end, no junction/3rd point)
    // 30% Fork (1 start -> 2 ends, with junction)
    // 30% Merge (2 starts -> 1 end, with junction)
    const mode = Math.random();

    if (mode < 0.4) {
      // SIMPLE: Direct path from Start1 to End1
      const path = this.traceRiverPath(startPos1, endPos1);
      this.paintRiverPath(path);
    } else if (mode < 0.7) {
      // FORK: 1 Start, 2 Ends meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      const path2 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path2);

      // 2nd End point on a remaining edge
      const remainingEdges = edges.filter((e) => e !== startEdge1 && e !== endEdge1);
      const endEdge2 = remainingEdges[Math.floor(Math.random() * remainingEdges.length)] || endEdge1;
      const endPos2 = this.getRandomEdgePoint(endEdge2);

      const path3 = this.traceRiverPath(junction, endPos2);
      this.paintRiverPath(path3);
    } else {
      // MERGE: 2 Starts, 1 End meeting at Junction
      const path1 = this.traceRiverPath(startPos1, junction);
      this.paintRiverPath(path1);

      // 2nd Start point on a remaining edge
      const remainingEdges = edges.filter((e) => e !== startEdge1 && e !== endEdge1);
      const startEdge2 = remainingEdges[Math.floor(Math.random() * remainingEdges.length)] || startEdge1;
      const startPos2 = this.getRandomEdgePoint(startEdge2);

      const path2 = this.traceRiverPath(startPos2, junction);
      this.paintRiverPath(path2);

      const path3 = this.traceRiverPath(junction, endPos1);
      this.paintRiverPath(path3);
    }
  }

  getRandomEdgePoint(edge) {
    const margin = Math.max(3, Math.floor(Math.min(this.width, this.height) * 0.1));
    switch (edge) {
      case 'top':    return { x: margin + Math.floor(Math.random() * (this.width - margin * 2)), y: 0 };
      case 'bottom': return { x: margin + Math.floor(Math.random() * (this.width - margin * 2)), y: this.height - 1 };
      case 'left':   return { x: 0, y: margin + Math.floor(Math.random() * (this.height - margin * 2)) };
      case 'right':  return { x: this.width - 1, y: margin + Math.floor(Math.random() * (this.height - margin * 2)) };
    }
  }

  traceRiverPath(start, end) {
    const path = [{ x: start.x, y: start.y }];
    let x = start.x, y = start.y;
    const maxSteps = (this.width + this.height) * 4;

    while (path.length < maxSteps) {
      const dx = end.x - x;
      const dy = end.y - y;

      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        if (dx !== 0 || dy !== 0) path.push({ x: end.x, y: end.y });
        break;
      }

      // 65% move toward target, 35% wander for organic look
      if (Math.random() < 0.65) {
        if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && Math.random() < 0.5)) {
          x += Math.sign(dx);
        } else {
          y += Math.sign(dy);
        }
      } else {
        // Perpendicular wander
        if (Math.abs(dx) >= Math.abs(dy)) {
          y += Math.random() < 0.5 ? -1 : 1;
        } else {
          x += Math.random() < 0.5 ? -1 : 1;
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

  computeRiverFlowOrder() {}

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
    return tile.terrain === TERRAIN_TYPE.EMPTY && !tile.hasRoad && tile.zone === ZONE.NONE && !tile.producer;
  }

  canZone(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain !== TERRAIN_TYPE.EMPTY) return false;
    if (tile.hasRoad || tile.producer) return false;
    if (tile.zone !== ZONE.NONE) return false;
    return this.isRoadAdjacent(x, y);
  }

  canPlaceProducer(x, y, producerType) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain !== TERRAIN_TYPE.EMPTY || tile.hasRoad || tile.zone !== ZONE.NONE || tile.producer) return false;

    if (producerType) {
      const config = PRODUCER_CONFIG[producerType];
      if (config && config.requiresWaterAdjacent && !this.isWaterAdjacent(x, y)) {
        return false;
      }
    }
    return true;
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
      x,
      y,
    };
    tile.producer = producer;
    this.producers.push(producer);
    return producer;
  }

  bulldoze(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;

    let modified = false;
    if (tile.terrain === TERRAIN_TYPE.FOREST) {
      tile.terrain = TERRAIN_TYPE.EMPTY;
      modified = true;
    }
    if (tile.producer) {
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
      tile.shortfall = { power: false, water: false, sewage: false };
      modified = true;
    }
    return modified;
  }
}
