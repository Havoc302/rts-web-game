import { COVERAGE_CONFIG, SERVICE_TYPE } from '../config.js';

export class CoverageManager {
  static lastGrid = null;
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
    if (serviceType && typeof serviceType !== 'string') {
      this.lastGrid = serviceType;
      serviceType = arguments[1] || null;
    }
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

  static getCoverageSet(gridOrKey, maybeKey) {
    if (maybeKey) {
      this.updateService(gridOrKey, maybeKey);
      return this.coverageSets[maybeKey] || new Set();
    }
    return this.coverageSets[gridOrKey] || new Set();
  }

  static prepareGrid(grid) {
    if (this.lastGrid !== grid) {
      this.lastGrid = grid;
      this.dirtyFlags.fire = true;
      this.dirtyFlags.police = true;
      this.dirtyFlags.medical = true;
    }
  }

  static isCovered(gridOrKey, keyOrX, xOrY, maybeY) {
    const grid = maybeY === undefined ? null : gridOrKey;
    const key = grid ? keyOrX : gridOrKey;
    const x = grid ? xOrY : keyOrX;
    const y = grid ? maybeY : xOrY;
    const set = grid ? this.getCoverageSet(grid, key) : this.coverageSets[key];
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
    let hash = `roads:${grid.coverageVersion || 0};`;
    for (const p of producers) {
      const filled = p.filledJobs || 0;
      const op = p.operational !== false ? 1 : 0;
      hash += `${p.id || p.x + ',' + p.y}:${p.type}:${p.x},${p.y}:${filled}:${op};`;
    }
    return hash;
  }

  static updateAll(grid) {
    this.prepareGrid(grid);
    this.updateService(grid, 'fire');
    this.updateService(grid, 'police');
    this.updateService(grid, 'medical');
  }

  static updateService(grid, key) {
    this.prepareGrid(grid);
    const currentHash = this.computeStateHash(grid, key);
    if (!this.dirtyFlags[key] && this.stateHashes[key] === currentHash) {
      return;
    }

    const types = this.getBuildingTypesForKey(key);
    const producers = (grid.producers || []).filter((p) => types.includes(p.type));
    const coverageSet = new Set();

    for (const prod of producers) {
      if (prod.operational === false || (prod.filledJobs || 0) <= 0) continue;
      const filledJobs = prod.filledJobs || 0;
      const bonus = Math.max(0, filledJobs - 1) * COVERAGE_CONFIG.JOB_BONUS_PER_FILLED;

      const directRange = COVERAGE_CONFIG.BASE_DIRECT_RANGE + bonus;
      const roadRange = COVERAGE_CONFIG.BASE_ROAD_RANGE + bonus;
      const roadAdjRange = COVERAGE_CONFIG.BASE_ROAD_ADJACENT_RANGE + bonus;

      const bWidth = prod.width || 1;
      const bHeight = prod.height || 1;

      // 1. Direct Manhattan range around the building footprint.
      for (let by = 0; by < bHeight; by++) {
        for (let bx = 0; bx < bWidth; bx++) {
          this.addManhattanArea(coverageSet, grid, prod.x + bx, prod.y + by, directRange);
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
            if (grid.isInBounds(n.x, n.y) && grid.getTile(n.x, n.y)?.hasRoad) {
              const posKey = n.y * grid.width + n.x;
              if (!visitedRoads.has(posKey)) {
                visitedRoads.set(posKey, 1);
                startingRoads.push({ x: n.x, y: n.y, dist: 1 });
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
            if (grid.isInBounds(d.x, d.y) && grid.getTile(d.x, d.y)?.hasRoad) {
              const keyNum = d.y * grid.width + d.x;
              const nextDist = curr.dist + 1;
              if (!visitedRoads.has(keyNum) || visitedRoads.get(keyNum) > nextDist) {
                visitedRoads.set(keyNum, nextDist);
                queue.push({ x: d.x, y: d.y, dist: nextDist });
              }
            }
          }
        }
      }

      // 3. For each reached road tile, add surrounding tiles within roadSideRange.
      for (const rTile of reachedRoads) {
        this.addManhattanArea(coverageSet, grid, rTile.x, rTile.y, roadAdjRange);
      }
    }

    this.coverageSets[key] = coverageSet;
    this.dirtyFlags[key] = false;
    this.stateHashes[key] = currentHash;
  }

  static addManhattanArea(coverage, grid, centerX, centerY, radius) {
    for (let y = Math.max(0, centerY - radius); y <= Math.min(grid.height - 1, centerY + radius); y++) {
      for (let x = Math.max(0, centerX - radius); x <= Math.min(grid.width - 1, centerX + radius); x++) {
        if (Math.abs(x - centerX) + Math.abs(y - centerY) <= radius) {
          coverage.add(`${x},${y}`);
        }
      }
    }
  }
}
