import { FIRE_CONFIG, PRODUCER_TYPE, ZONE, TERRAIN, TERRAIN_TYPE } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class FireManager {
  static updateFires(grid, stats) {
    stats.fireInjuries = 0;

    // 1. Random ignition roll on placed buildings (zoned tiles and non-water producers)
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.tiles[y][x];
        if (tile.destroyed) continue;
        if (tile.onFire) continue;

        const isBuilding = tile.zone !== ZONE.NONE || (tile.producer && tile.terrain !== TERRAIN_TYPE.RIVER);
        if (!isBuilding) continue;

        const chance = this.getIgnitionChance(tile);

        if (Math.random() < chance) {
          tile.onFire = true;
          tile.fireDamage = 0;
        }
      }
    }

    // 2. Suppression & damage phase
    const { roadDistancesMap } = RoadNetwork.computeProducerDistances(grid, PRODUCER_TYPE.FIRE_STATION);
    const burningTiles = [];

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.tiles[y][x];
        if (!tile.onFire) continue;
        burningTiles.push(tile);

        if (tile.zone === ZONE.RESIDENTIAL && tile.population > 0) {
          const residentsToRelocate = Math.ceil(
            tile.population * FIRE_CONFIG.BURNING_POPULATION_RELOCATION_RATE,
          );
          tile.fireDisplacedPopulation = (tile.fireDisplacedPopulation || 0) + residentsToRelocate;
          stats.displacedPopulation = (stats.displacedPopulation || 0) + residentsToRelocate;
        }

        stats.fireInjuries += FIRE_CONFIG.INJURIES_PER_BURNING_TILE;

        const station = this.findNearestStation(grid, roadDistancesMap, tile);
        if (station) {
          const staffRatio = station.totalJobs > 0 ? station.filledJobs / station.totalJobs : 0;
          const suppression = FIRE_CONFIG.BASE_SUPPRESSION_POWER * staffRatio;
          tile.fireDamage = Math.max(0, tile.fireDamage - suppression);
          if (tile.fireDamage <= 0) {
            tile.onFire = false;
            tile.fireDamage = 0;
            continue;
          }
        }

        tile.fireDamage += FIRE_CONFIG.DAMAGE_PER_TICK;
        if (tile.fireDamage >= FIRE_CONFIG.MAX_DAMAGE) {
          if (tile.zone === ZONE.RESIDENTIAL && tile.population > 0) {
            const remainingResidents = Math.max(0, tile.population - (tile.fireDisplacedPopulation || 0));
            stats.displacedPopulation = (stats.displacedPopulation || 0) + remainingResidents;
          }
          grid.bulldoze(x, y);
          tile.destroyed = true;
          tile.onFire = false;
          tile.fireDamage = 0;
        }
      }
    }

    // 3. Fire spread phase
    for (const tile of burningTiles) {
      if (!tile.onFire) continue; // may have been suppressed or destroyed above
      for (const neighbor of grid.getNeighbors8(tile.x, tile.y)) {
        if (neighbor.onFire) continue;
        if (neighbor.terrain === TERRAIN_TYPE.EMPTY || neighbor.terrain === TERRAIN_TYPE.RIVER || neighbor.hasRoad || neighbor.hasBridge) continue;
        if (Math.random() < FIRE_CONFIG.SPREAD_CHANCE_PER_TICK) {
          neighbor.onFire = true;
          neighbor.fireDamage = 0;
        }
      }
    }
  }

  static getOccupancyRatio(tile) {
    let occupied = 0;
    let capacity = 0;
    if (tile.zone === ZONE.RESIDENTIAL) {
      occupied = tile.population || 0;
      capacity = tile.maxPopulation || 0;
    } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
      occupied = tile.filledJobs || 0;
      capacity = tile.totalJobs || 0;
    }
    return capacity > 0 ? Math.min(1, Math.max(0, occupied / capacity)) : 0;
  }

  static getIgnitionChance(tile) {
    if (tile.terrain === TERRAIN.FOREST) {
      return FIRE_CONFIG.FOREST_IGNITION_CHANCE;
    }
    if (tile.zone === ZONE.NONE) {
      return FIRE_CONFIG.BASE_IGNITION_CHANCE;
    }

    const maxChance = tile.zone === ZONE.INDUSTRIAL
      ? FIRE_CONFIG.MAX_IGNITION_CHANCE_INDUSTRIAL
      : FIRE_CONFIG.MAX_IGNITION_CHANCE_NON_INDUSTRIAL;
    const chance = maxChance * this.getOccupancyRatio(tile);
    const pollutionBonus = (tile.pollution || 0) >= FIRE_CONFIG.HIGH_POLLUTION_IGNITION_THRESHOLD
      ? FIRE_CONFIG.HIGH_POLLUTION_IGNITION_BONUS
      : 0;
    return Math.min(maxChance, chance + pollutionBonus);
  }

  // Nearest operational fire station covering this tile, mirroring ServiceManager's road-adjacency lookup.
  static findNearestStation(grid, roadDistancesMap, tile) {
    let best = null;
    let bestDist = Infinity;

    const checkKey = (key, extraDist) => {
      const entries = roadDistancesMap.get(key);
      if (!entries) return;
      for (const info of entries.values()) {
        const producer = info.producer;
        if (!producer.operational) continue;
        const dist = info.distance + extraDist;
        if (dist <= (producer.effectiveRadius || 0) && dist < bestDist) {
          bestDist = dist;
          best = producer;
        }
      }
    };

    checkKey(`${tile.x},${tile.y}`, 0);
    for (const neighbor of grid.getNeighbors(tile.x, tile.y)) {
      checkKey(`${neighbor.x},${neighbor.y}`, 1);
    }

    return best;
  }
}
