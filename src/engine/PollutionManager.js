import { ZONE, PRODUCER_TYPE, TERRAIN, POLLUTION_CONFIG, FOREST_POLLUTION_ABSORPTION, COAL_CONFIG } from '../config.js';

export class PollutionManager {
  static updateIfNeeded(grid) {
    const stateKey = this.getStateKey(grid);
    if (!grid.pollutionDirty && grid.pollutionStateKey === stateKey) return false;
    this.computePollution(grid);
    grid.pollutionDirty = false;
    grid.pollutionStateKey = stateKey;
    return true;
  }

  static getStateKey(grid) {
    const zonedTiles = grid.getActiveZonedTiles();
    const zoneState = [];
    for (const tile of zonedTiles) {
      if (tile.zone === ZONE.INDUSTRIAL || tile.shortfall.sewage) {
        zoneState.push(`${tile.x},${tile.y}:${tile.zone}:${tile.density}:${tile.shortfall.sewage ? 1 : 0}:${tile.onFire ? 1 : 0}`);
      }
    }
    const producerState = grid.producers
      .filter((producer) => (
        producer.type === PRODUCER_TYPE.COAL_PLANT ||
        producer.type === PRODUCER_TYPE.SEWAGE_PLANT ||
        producer.type === PRODUCER_TYPE.WATER_TOWER
      ))
      .map((producer) => `${producer.id}:${producer.type}:${producer.x},${producer.y}:${producer.usedCapacity}:${producer.capacity}:${producer.operational ? 1 : 0}`);
    return `${grid.terrainVersion}|${zoneState.sort().join('|')}|${producerState.sort().join('|')}`;
  }

  static computePollution(grid) {
    if (!grid.pollutedTiles) grid.pollutedTiles = new Set();
    if (!grid.pollutedWaterTiles) grid.pollutedWaterTiles = new Set();

    // Step 1: Reset prior affected tiles
    for (const tile of grid.pollutedTiles) {
      tile.pollution = 0;
    }
    grid.pollutedTiles.clear();

    for (const p of grid.producers) {
      p.contaminated = false;
    }

    // Step 2: Source A — Industrial zone radius emission
    for (const tile of grid.getActiveZonedTiles()) {
      if (tile.zone !== ZONE.INDUSTRIAL) continue;

      const radius = POLLUTION_CONFIG.INDUSTRIAL_RADIUS[tile.density] || POLLUTION_CONFIG.DEFAULT_INDUSTRIAL_RADIUS;
      const emission = POLLUTION_CONFIG.INDUSTRIAL_EMISSION[tile.density] || POLLUTION_CONFIG.DEFAULT_INDUSTRIAL_EMISSION;

      this.spreadPollution(grid, tile.x, tile.y, radius, emission);
    }

    // Step 3: Source B — Sewage backup emission from shortfall-flagged tiles
    for (const tile of grid.getActiveZonedTiles()) {
      if (!tile.shortfall.sewage) continue;

      this.spreadPollution(
        grid, tile.x, tile.y,
        POLLUTION_CONFIG.SEWAGE_BACKUP_RADIUS,
        POLLUTION_CONFIG.SEWAGE_BACKUP_EMISSION
      );
    }

    // Step 3b: Source B2 — Coal power plant smokestack emission
    for (const plant of grid.producers) {
      if (plant.type === PRODUCER_TYPE.COAL_PLANT) {
        this.spreadPollution(grid, plant.x, plant.y, COAL_CONFIG.RADIUS, COAL_CONFIG.EMISSION);
      }
    }

    // Step 4: Source C — River discharge contamination
    const waterTowers = grid.producers.filter((p) => p.type === PRODUCER_TYPE.WATER_TOWER);
    
    this.computeWaterPollution(grid);

    for (const tower of waterTowers) {
      const neighbors = grid.getNeighbors(tower.x, tower.y);
      const isDownstreamFromSewage = neighbors.some(
        (n) => n.terrain === TERRAIN.WATER && n.isPolluted
      );

      if (isDownstreamFromSewage) {
        tower.contaminated = true;
        this.spreadPollution(
          grid, tower.x, tower.y,
          POLLUTION_CONFIG.CONTAMINATED_TOWER_RADIUS,
          POLLUTION_CONFIG.CONTAMINATED_TOWER_EMISSION
        );
      }
    }

    // Step 5: Forest pollution absorption (only check tiles that are currently polluted)
    for (const tile of grid.pollutedTiles) {
      if (tile.terrain === TERRAIN.FOREST && tile.pollution > 0) {
        tile.pollution = Math.max(0, tile.pollution - FOREST_POLLUTION_ABSORPTION);
      }
    }

    grid.refreshPollutionAggregates();
  }

  static computeWaterPollution(grid) {
    if (!grid.pollutedWaterTiles) grid.pollutedWaterTiles = new Set();

    // 1. Reset water pollution status of previously polluted water tiles
    for (const tile of grid.pollutedWaterTiles) {
      tile.isPolluted = false;
      tile.riverPollution = 0;
    }
    grid.pollutedWaterTiles.clear();

    // 2. Find sewage plants and their neighboring water tiles
    const sewagePlants = grid.producers.filter((p) => p.type === PRODUCER_TYPE.SEWAGE_PLANT);
    if (sewagePlants.length === 0) return;

    const sourceStrengths = new Map();
    const addSourceStrength = (tile, strength) => {
      if (strength <= 0) return;
      const key = tile.y * grid.width + tile.x;
      sourceStrengths.set(key, { tile, strength: (sourceStrengths.get(key)?.strength || 0) + strength });
    };

    for (const plant of sewagePlants) {
      const discharge = plant.usedCapacity || 0;
      if (discharge <= 0) continue;
      const neighbors = grid.getNeighbors(plant.x, plant.y);
      for (const n of neighbors) {
        if (n.terrain === TERRAIN.WATER) {
          addSourceStrength(n, discharge);
        }
      }
    }

    const queue = [];
    const visited = new Set();
    for (const [key, { tile, strength }] of sourceStrengths) {
      tile.riverPollution = strength;
      tile.isPolluted = true;
      grid.pollutedWaterTiles.add(tile);
      visited.add(key);
      queue.push({ tile, strength });
    }

    // 3. BFS downstream flow traversal
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];

    while (queue.length > 0) {
      const { tile: curr, strength } = queue.shift();
      const nextStrength = strength - POLLUTION_CONFIG.RIVER_SEWAGE_FALLOFF;
      if (nextStrength <= 0) continue;

      for (const [dx, dy] of offsets) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;

        const neighbor = grid.getTile(nx, ny);
        if (!neighbor || neighbor.terrain !== TERRAIN.WATER) continue;

        // Check if step (dx, dy) is in downstream flow direction
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ndx = dx / dist;
        const ndy = dy / dist;

        const isDownstream = curr.riverFlowDir
          ? ndx * curr.riverFlowDir.x + ndy * curr.riverFlowDir.y > POLLUTION_CONFIG.RIVER_FLOW_DOWNSTREAM_THRESHOLD
          : false;

        if (isDownstream) {
          const neighborKey = neighbor.y * grid.width + neighbor.x;
          if (visited.has(neighborKey)) continue;
          visited.add(neighborKey);
          neighbor.riverPollution = nextStrength;
          neighbor.isPolluted = true;
          grid.pollutedWaterTiles.add(neighbor);
          queue.push({ tile: neighbor, strength: nextStrength });
        }
      }
    }
  }

  static spreadPollution(grid, cx, cy, radius, emission) {
    if (!grid.pollutedTiles) grid.pollutedTiles = new Set();
    const minY = Math.max(0, cy - radius);
    const maxY = Math.min(grid.height - 1, cy + radius);
    const minX = Math.max(0, cx - radius);
    const maxX = Math.min(grid.width - 1, cx + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.abs(x - cx) + Math.abs(y - cy);
        if (dist <= radius) {
          const amount = Math.max(0, emission - dist);
          if (amount > 0) {
            const tile = grid.tiles[y][x];
            tile.pollution += amount;
            grid.pollutedTiles.add(tile);
          }
        }
      }
    }
  }
}
