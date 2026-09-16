import { COVERAGE_CONFIG, SERVICE_TYPE } from '../config.js';

export class CoverageManager {
  static coverageSets = {
    fire: new Set(),
    police: new Set(),
    medical: new Set(),
  };

  static dirtyFlags = {
    fire: true,
    police: true,
    medical: true,
  };

  static stateHashes = {
    fire: '',
    police: '',
    medical: '',
  };

  static markDirty(serviceType = null) {
    if (serviceType) {
      if (this.dirtyFlags[serviceType] !== undefined) {
        this.dirtyFlags[serviceType] = true;
      }
    } else {
      this.dirtyFlags.fire = true;
      this.dirtyFlags.police = true;
      this.dirtyFlags.medical = true;
    }
  }

  static getCoverageSet(key) {
    return this.coverageSets[key] || new Set();
  }

  static isCovered(key, x, y) {
    const set = this.coverageSets[key];
    if (!set) return false;
    return set.has(`${x},${y}`);
  }

  static getBuildingTypesForKey(key) {
    switch (key) {
      case 'fire':
        return [SERVICE_TYPE.FIRE_STATION];
      case 'police':
        return [SERVICE_TYPE.POLICE_STATION];
      case 'medical':
        return [SERVICE_TYPE.HOSPITAL, SERVICE_TYPE.CLINIC];
      default:
        return [];
    }
  }

  static computeStateHash(grid, key) {
    const types = this.getBuildingTypesForKey(key);
    const producers = (grid.producers || []).filter((p) => types.includes(p.type));
    let hash = `roads:${grid.roadNetworkDirtyCounter || 0};`;
    for (const p of producers) {
      const filled = p.filledJobs || 0;
      const op = p.operational !== false ? 1 : 0;
      hash += `${p.id || p.x + ',' + p.y}:${p.type}:${p.x},${p.y}:${filled}:${op};`;
    }
    return hash;
  }

  static updateAll(grid) {
    this.updateService(grid, 'fire');
    this.updateService(grid, 'police');
    this.updateService(grid, 'medical');
  }

  static updateService(grid, key) {
    const currentHash = this.computeStateHash(grid, key);
    if (!this.dirtyFlags[key] && this.stateHashes[key] === currentHash) {
      return;
    }

    const types = this.getBuildingTypesForKey(key);
    const producers = (grid.producers || []).filter((p) => types.includes(p.type));
    const coverageSet = new Set();

    for (const prod of producers) {
      if (prod.operational === false) continue;
      const filledJobs = prod.filledJobs || 0;
      const bonus = filledJobs * COVERAGE_CONFIG.JOB_BONUS_PER_FILLED;

      const directRange = COVERAGE_CONFIG.BASE_DIRECT_RANGE + bonus;
      const roadRange = COVERAGE_CONFIG.BASE_ROAD_RANGE + bonus;
      const roadAdjRange = COVERAGE_CONFIG.BASE_ROAD_ADJACENT_RANGE + bonus;

      const bWidth = prod.width || 1;
      const bHeight = prod.height || 1;

      // 1. Direct range in every direction around building footprint
      const minX = Math.max(0, prod.x - directRange);
      const maxX = Math.min(grid.width - 1, prod.x + bWidth - 1 + directRange);
      const minY = Math.max(0, prod.y - directRange);
      const maxY = Math.min(grid.height - 1, prod.y + bHeight - 1 + directRange);

      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          coverageSet.add(`${cx},${cy}`);
        }
      }

      // 2. Road BFS from building adjacent road tiles
      const startingRoads = [];
      const visitedRoads = new Map(); // key -> distance

      // Find initial road tiles adjacent to building
      for (let by = 0; by < bHeight; by++) {
        for (let bx = 0; bx < bWidth; bx++) {
          const tx = prod.x + bx;
          const ty = prod.y + by;
          const neighbors = [
            { x: tx + 1, y: ty },
            { x: tx - 1, y: ty },
            { x: tx, y: ty + 1 },
            { x: tx, y: ty - 1 },
          ];
          for (const n of neighbors) {
            if (grid.isInBounds(n.x, n.y) && grid.isRoad(n.x, n.y)) {
              const posKey = `${n.x},${n.y}`;
              if (!visitedRoads.has(posKey)) {
                visitedRoads.set(posKey, 0);
                startingRoads.push({ x: n.x, y: n.y, dist: 0 });
              }
            }
          }
        }
      }

      // Queue BFS over road network
      const queue = [...startingRoads];
      const reachedRoads = [];

      while (queue.length > 0) {
        const curr = queue.shift();
        reachedRoads.push(curr);

        if (curr.dist < roadRange) {
          const dirs = [
            { x: curr.x + 1, y: curr.y },
            { x: curr.x - 1, y: curr.y },
            { x: curr.x, y: curr.y + 1 },
            { x: curr.x, y: curr.y - 1 },
          ];
          for (const d of dirs) {
            if (grid.isInBounds(d.x, d.y) && grid.isRoad(d.x, d.y)) {
              const keyStr = `${d.x},${d.y}`;
              const nextDist = curr.dist + 1;
              if (!visitedRoads.has(keyStr) || visitedRoads.get(keyStr) > nextDist) {
                visitedRoads.set(keyStr, nextDist);
                queue.push({ x: d.x, y: d.y, dist: nextDist });
              }
            }
          }
        }
      }

      // 3. For each reached road tile, add surrounding tiles within roadAdjRange
      for (const rTile of reachedRoads) {
        const rMinX = Math.max(0, rTile.x - roadAdjRange);
        const rMaxX = Math.min(grid.width - 1, rTile.x + roadAdjRange);
        const rMinY = Math.max(0, rTile.y - roadAdjRange);
        const rMaxY = Math.min(grid.height - 1, rTile.y + roadAdjRange);

        for (let ry = rMinY; ry <= rMaxY; ry++) {
          for (let rx = rMinX; rx <= rMaxX; rx++) {
            coverageSet.add(`${rx},${ry}`);
          }
        }
      }
    }

    this.coverageSets[key] = coverageSet;
    this.dirtyFlags[key] = false;
    this.stateHashes[key] = currentHash;
  }
}
