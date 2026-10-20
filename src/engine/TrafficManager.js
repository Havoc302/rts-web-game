import { PRODUCER_TYPE, TILE_SIZE, TRAFFIC_CONFIG } from '../config.js';

export function getAdjacentRoadTiles(x, y, grid) {
  if (!grid || typeof grid.getNeighbors !== 'function') return [];
  return grid.getNeighbors(x, y).filter((tile) => tile.hasRoad);
}

export class TrafficManager {
  constructor(options = {}) {
    this.grid = options.grid || null;
    this.cars = [];
    this.colors = options.colors || TRAFFIC_CONFIG?.COLORS || ['#ff4d4d', '#4d79ff', '#ffff4d', '#ffffff', '#4dff88'];
    this.populationPerBand = options.populationPerBand ?? TRAFFIC_CONFIG?.POPULATION_PER_BAND ?? 500;
    this.minCarsPerBand = options.minCarsPerBand ?? TRAFFIC_CONFIG?.MIN_CARS_PER_BAND ?? 1;
    this.maxCarsPerBand = options.maxCarsPerBand ?? TRAFFIC_CONFIG?.MAX_CARS_PER_BAND ?? 3;
    this.emergencyCarChance = options.emergencyCarChance ?? TRAFFIC_CONFIG?.EMERGENCY_CAR_CHANCE ?? 0.12;
    this.emergencyLights = options.emergencyLights || TRAFFIC_CONFIG?.EMERGENCY_LIGHTS || ['#ef4444', '#3b82f6'];
    this.speedMin = options.speedMin ?? TRAFFIC_CONFIG?.SPEED_MIN ?? 0.02;
    this.speedMax = options.speedMax ?? TRAFFIC_CONFIG?.SPEED_MAX ?? 0.04;
    this.carSize = options.carSize ?? TRAFFIC_CONFIG?.CAR_SIZE ?? 3;
    this.laneOffset = options.laneOffset ?? TRAFFIC_CONFIG?.LANE_OFFSET ?? 0.2;

    // One entry per 500 residents, each worth 1-3 dots. Rolling once per band keeps the
    // count stable between ticks instead of re-randomising every frame.
    this.carBands = [];
    this.elapsed = 0;
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

  // Car count grows in population bands: 1-500 residents is worth 1-3 dots, 501-1000 adds
  // another 1-3, and so on. Bands are rolled once so the total steps up rather than
  // shimmering on every tick.
  calculateTargetCarCount(currentPopulation) {
    const population = Math.max(0, Number(currentPopulation) || 0);
    const bands = population > 0 ? Math.ceil(population / this.populationPerBand) : 0;
    while (this.carBands.length < bands) {
      this.carBands.push(this.minCarsPerBand + Math.floor(
        Math.random() * (this.maxCarsPerBand - this.minCarsPerBand + 1),
      ));
    }
    if (this.carBands.length > bands) this.carBands.length = bands;
    return this.carBands.reduce((sum, count) => sum + count, 0);
  }

  // Emergency vehicles only exist while a police station, fire station, or hospital stands.
  hasEmergencyService(grid = this.grid) {
    return Boolean(grid?.producers?.some((producer) => (
      producer.type === PRODUCER_TYPE.POLICE_STATION ||
      producer.type === PRODUCER_TYPE.FIRE_STATION ||
      producer.type === PRODUCER_TYPE.HOSPITAL
    )));
  }

  createCar(startTile) {
    const emergency = !this.cars.some((car) => car.emergency) &&
      this.hasEmergencyService() &&
      Math.random() < this.emergencyCarChance;
    return {
      x: startTile.x + 0.5,
      y: startTile.y + 0.5,
      targetX: startTile.x + 0.5,
      targetY: startTile.y + 0.5,
      prevTileX: startTile.x,
      prevTileY: startTile.y,
      dirX: 0,
      dirY: 0,
      speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      emergency,
    };
  }

  syncCarCount(targetCount, activeRoadTiles = this.activeRoadArray) {
    const roads = Array.isArray(activeRoadTiles)
      ? activeRoadTiles
      : (activeRoadTiles ? Array.from(activeRoadTiles) : []);

    while (this.cars.length < targetCount && roads.length > 0) {
      this.cars.push(this.createCar(roads[Math.floor(Math.random() * roads.length)]));
    }

    if (this.cars.length > targetCount) {
      this.cars.length = targetCount;
    }
  }

  updateDensity(simulation, grid = this.grid) {
    const targetGrid = grid || this.grid;
    if (!targetGrid) return;
    this.grid = targetGrid;
    if (targetGrid.coverageVersion !== this.lastCoverageVersion || this.activeRoadArray.length === 0) {
      this.rebuildRoadCache(targetGrid);
    }
    const targetCount = this.calculateTargetCarCount(simulation?.stats?.population || 0);
    this.syncCarCount(targetCount, this.activeRoadArray);
  }

  update(dt, roadNetworkGrid = this.grid) {
    const grid = roadNetworkGrid || this.grid;
    this.elapsed += typeof dt === 'number' && dt > 0 ? dt : 0;
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

      if (dist > 0.0001) {
        car.dirX = dx / dist;
        car.dirY = dy / dist;
      }

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

          const nextDx = car.targetX - car.x;
          const nextDy = car.targetY - car.y;
          const nextDist = Math.hypot(nextDx, nextDy);
          if (nextDist > 0.0001) {
            car.dirX = nextDx / nextDist;
            car.dirY = nextDy / nextDist;
          }
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
    const emergencyCars = [];

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const laneOffsetX = (car.dirY || 0) * this.laneOffset;
      const laneOffsetY = -(car.dirX || 0) * this.laneOffset;

      const screenX = ((car.x + laneOffsetX) * tileSize) - offX;
      const screenY = ((car.y + laneOffsetY) * tileSize) - offY;

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

      if (car.emergency) {
        emergencyCars.push({ screenX, screenY });
        continue;
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

    // Emergency vehicles are a white dot with two 1px corner lights that swap red/blue
    // about four times a second, so they read as flashing from a distance.
    if (emergencyCars.length > 0) {
      const [redLight, blueLight] = this.emergencyLights;
      const flashPhase = Math.floor(this.elapsed * 4) % 2 === 0;
      for (const { screenX, screenY } of emergencyCars) {
        const x = Math.round(screenX - halfSize);
        const y = Math.round(screenY - halfSize);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, this.carSize, this.carSize);
        ctx.fillStyle = flashPhase ? redLight : blueLight;
        ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = flashPhase ? blueLight : redLight;
        ctx.fillRect(x + this.carSize - 1, y + this.carSize - 1, 1, 1);
      }
    }
    ctx.restore();
  }
}
