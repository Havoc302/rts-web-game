import { TILE_SIZE, TRAFFIC_CONFIG } from '../config.js';

export function getAdjacentRoadTiles(x, y, grid) {
  if (!grid || typeof grid.getNeighbors !== 'function') return [];
  return grid.getNeighbors(x, y).filter((tile) => tile.hasRoad);
}

export class TrafficManager {
  constructor(options = {}) {
    this.grid = options.grid || null;
    this.cars = [];
    this.colors = options.colors || TRAFFIC_CONFIG?.COLORS || ['#ff4d4d', '#4d79ff', '#ffff4d', '#ffffff', '#4dff88'];
    this.maxCarsPerRoadTile = options.maxCarsPerRoadTile ?? TRAFFIC_CONFIG?.MAX_CARS_PER_ROAD_TILE ?? 0.3;
    this.speedMin = options.speedMin ?? TRAFFIC_CONFIG?.SPEED_MIN ?? 0.02;
    this.speedMax = options.speedMax ?? TRAFFIC_CONFIG?.SPEED_MAX ?? 0.04;
    this.carSize = options.carSize ?? TRAFFIC_CONFIG?.CAR_SIZE ?? 3;

    this.roadAdjacencyMap = new Map();
    this.activeRoadArray = [];
    this.lastCoverageVersion = -1;
  }

  rebuildRoadCache(grid = this.grid) {
    this.roadAdjacencyMap.clear();
    const activeRoads = [];
    if (!grid) {
      this.activeRoadArray = activeRoads;
      return activeRoads;
    }

    const roadTiles = grid.activeRoadTiles ? Array.from(grid.activeRoadTiles) : [];
    for (let i = 0; i < roadTiles.length; i++) {
      const tile = roadTiles[i];
      if (!tile.hasRoad) continue;
      activeRoads.push(tile);
      const neighbors = getAdjacentRoadTiles(tile.x, tile.y, grid);
      this.roadAdjacencyMap.set(`${tile.x},${tile.y}`, neighbors);
    }

    this.activeRoadArray = activeRoads;
    this.lastCoverageVersion = grid.coverageVersion;
    return activeRoads;
  }

  getAdjacentRoadTiles(x, y, grid = this.grid) {
    const key = `${x},${y}`;
    if (this.roadAdjacencyMap.has(key)) {
      return this.roadAdjacencyMap.get(key);
    }
    return getAdjacentRoadTiles(x, y, grid);
  }

  calculateTargetCarCount(currentPopulation, maxPopulationCapacity, roadCount) {
    const saturationRatio = Math.min(1.0, currentPopulation / Math.max(1, maxPopulationCapacity));
    return Math.floor(roadCount * saturationRatio * this.maxCarsPerRoadTile);
  }

  syncCarCount(targetCount, activeRoadTiles = this.activeRoadArray) {
    const roads = Array.isArray(activeRoadTiles)
      ? activeRoadTiles
      : (activeRoadTiles ? Array.from(activeRoadTiles) : []);

    while (this.cars.length < targetCount && roads.length > 0) {
      const startTile = roads[Math.floor(Math.random() * roads.length)];
      this.cars.push({
        x: startTile.x + 0.5,
        y: startTile.y + 0.5,
        targetX: startTile.x + 0.5,
        targetY: startTile.y + 0.5,
        prevTileX: startTile.x,
        prevTileY: startTile.y,
        speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
      });
    }

    if (this.cars.length > targetCount) {
      this.cars.length = targetCount;
    }
  }

  updateDensity(simulation, grid = this.grid) {
    const targetGrid = grid || this.grid;
    if (!targetGrid) return;
    if (targetGrid.coverageVersion !== this.lastCoverageVersion || this.activeRoadArray.length === 0) {
      this.rebuildRoadCache(targetGrid);
    }
    const currentPopulation = simulation?.stats?.population || 0;
    const maxCapacity = simulation?.stats?.maxPopulationCapacity || 0;
    const targetCount = this.calculateTargetCarCount(currentPopulation, maxCapacity, this.activeRoadArray.length);
    this.syncCarCount(targetCount, this.activeRoadArray);
  }

  update(dt, roadNetworkGrid = this.grid) {
    const grid = roadNetworkGrid || this.grid;
    const stepFactor = (typeof dt === 'number' && dt > 0) ? Math.min(2.0, dt * 60) : 1.0;

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const targetTileX = Math.floor(car.targetX);
      const targetTileY = Math.floor(car.targetY);
      const targetTile = grid?.getTile ? grid.getTile(targetTileX, targetTileY) : null;

      if (grid?.getTile && (!targetTile || !targetTile.hasRoad)) {
        if (this.activeRoadArray.length > 0) {
          const respawn = this.activeRoadArray[Math.floor(Math.random() * this.activeRoadArray.length)];
          car.x = respawn.x + 0.5;
          car.y = respawn.y + 0.5;
          car.targetX = respawn.x + 0.5;
          car.targetY = respawn.y + 0.5;
          car.prevTileX = respawn.x;
          car.prevTileY = respawn.y;
        }
        continue;
      }

      const dx = car.targetX - car.x;
      const dy = car.targetY - car.y;
      const dist = Math.hypot(dx, dy);
      const moveStep = car.speed * stepFactor;

      if (dist <= moveStep) {
        car.x = car.targetX;
        car.y = car.targetY;

        const currentTileX = Math.floor(car.x);
        const currentTileY = Math.floor(car.y);
        const validNeighbors = this.getAdjacentRoadTiles(currentTileX, currentTileY, grid);

        if (validNeighbors.length > 0) {
          let choices = validNeighbors;
          if (validNeighbors.length > 1 && car.prevTileX !== undefined) {
            const forwardChoices = validNeighbors.filter(
              (n) => n.x !== car.prevTileX || n.y !== car.prevTileY
            );
            if (forwardChoices.length > 0) choices = forwardChoices;
          }
          const next = choices[Math.floor(Math.random() * choices.length)];
          car.prevTileX = currentTileX;
          car.prevTileY = currentTileY;
          car.targetX = next.x + 0.5;
          car.targetY = next.y + 0.5;
        } else if (this.activeRoadArray.length > 0) {
          const respawn = this.activeRoadArray[Math.floor(Math.random() * this.activeRoadArray.length)];
          car.x = respawn.x + 0.5;
          car.y = respawn.y + 0.5;
          car.targetX = respawn.x + 0.5;
          car.targetY = respawn.y + 0.5;
          car.prevTileX = respawn.x;
          car.prevTileY = respawn.y;
        }
      } else {
        car.x += (dx / dist) * moveStep;
        car.y += (dy / dist) * moveStep;
      }
    }
  }

  draw(ctx, tileSize = TILE_SIZE, cameraOffset = { x: 0, y: 0 }, visibleBounds = null) {
    if (!ctx || this.cars.length === 0) return;
    const offX = cameraOffset?.x ?? 0;
    const offY = cameraOffset?.y ?? 0;
    const halfSize = this.carSize / 2;

    const batches = new Map();
    for (let c = 0; c < this.colors.length; c++) {
      batches.set(this.colors[c], []);
    }

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const screenX = (car.x * tileSize) - offX;
      const screenY = (car.y * tileSize) - offY;

      if (visibleBounds) {
        if (
          screenX < visibleBounds.left - tileSize ||
          screenX > visibleBounds.right + tileSize ||
          screenY < visibleBounds.top - tileSize ||
          screenY > visibleBounds.bottom + tileSize
        ) {
          continue;
        }
      }

      let coords = batches.get(car.color);
      if (!coords) {
        coords = [];
        batches.set(car.color, coords);
      }
      coords.push(screenX, screenY);
    }

    ctx.save();
    for (const [color, coords] of batches) {
      if (coords.length === 0) continue;
      ctx.fillStyle = color;
      for (let j = 0; j < coords.length; j += 2) {
        ctx.fillRect(coords[j] - halfSize, coords[j + 1] - halfSize, this.carSize, this.carSize);
      }
    }
    ctx.restore();
  }
}
