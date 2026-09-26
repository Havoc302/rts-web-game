import { FIRE_CONFIG, PRODUCER_TYPE, ZONE, TERRAIN, TERRAIN_TYPE, TEMPERATURE_CONFIG } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';
import { CoverageManager } from './CoverageManager.js';

export class FireManager {
  static isRoadLike(tile) {
    return Boolean(tile.hasRoad || tile.hasBridge || tile.hasTunnel);
  }

  static isFlammable(tile) {
    if (!tile || tile.destroyed) return false;
    if (tile.terrain === TERRAIN.WATER || tile.terrain === TERRAIN_TYPE.RIVER) return false;
    if (this.isRoadLike(tile)) return false;
    if (tile.terrain === TERRAIN.MOUNTAIN) return false;
    if (tile.terrain === TERRAIN.FOREST) return true;
    if (tile.producer) return true;
    if (tile.zone !== ZONE.NONE && this.getOccupancyRatio(tile) > 0) return true;
    return false;
  }

  static updateFires(grid, stats, weatherManager = null) {
    stats.fireInjuries = 0;
    stats.displacedPopulation = 0;

    for (const tile of grid.repairingTiles) {
      tile.fireRepair = Math.min(1, (tile.fireRepair || 0) + FIRE_CONFIG.REPAIR_PER_TICK);
      if (tile.fireRepair >= 1) grid.repairingTiles.delete(tile);
    }

    for (const tile of grid.getFireCandidateTiles()) {
      if (tile.destroyed || tile.onFire || !this.isFlammable(tile)) continue;
      let chance = this.getIgnitionChance(tile);
      if (weatherManager && weatherManager.temperature > TEMPERATURE_CONFIG.FIRE_RISK_THRESHOLD) {
        chance *= TEMPERATURE_CONFIG.FIRE_RISK_MULTIPLIER;
      }
      if (chance > 0 && Math.random() < chance) {
        tile.onFire = true;
        tile.fireDamage = 0;
        if (tile.terrain === TERRAIN.FOREST) tile.forestFireInjury = null;
        grid.activeFireTiles.add(tile);
      }
    }

    const burningTiles = Array.from(grid.getActiveFireTiles());

    for (const tile of burningTiles) {

        if (tile.zone === ZONE.RESIDENTIAL && tile.population > 0) {
          const residentsToRelocate = Math.ceil(
            tile.population * FIRE_CONFIG.BURNING_POPULATION_RELOCATION_RATE,
          );
          tile.fireDisplacedPopulation = (tile.fireDisplacedPopulation || 0) + residentsToRelocate;
          stats.displacedPopulation = (stats.displacedPopulation || 0) + residentsToRelocate;
        }

        if (tile.terrain === TERRAIN.FOREST) {
          if (tile.forestFireInjury == null) {
            tile.forestFireInjury = Math.random() < FIRE_CONFIG.FOREST_FIRE_INJURY_CHANCE;
          }
          if (tile.forestFireInjury) stats.fireInjuries += 1;
        } else if (tile.zone !== ZONE.NONE || tile.producer) {
          stats.fireInjuries += FIRE_CONFIG.INJURIES_PER_BURNING_TILE;
        }

        const station = this.findNearestStation(grid, tile);
        if (station) {
          const staffRatio = station.totalJobs > 0 ? station.filledJobs / station.totalJobs : 0;
          const suppression = FIRE_CONFIG.BASE_SUPPRESSION_POWER * staffRatio;
          const damageBefore = tile.fireDamage || 0;
          tile.fireDamage = Math.max(0, damageBefore - suppression);
          if (tile.fireDamage <= 0) {
            tile.onFire = false;
            tile.fireDamage = 0;
            grid.activeFireTiles.delete(tile);
            if (damageBefore > 0) {
              tile.fireRepair = 0;
              grid.repairingTiles.add(tile);
            }
            continue;
          }
        }

        tile.fireDamage += FIRE_CONFIG.DAMAGE_PER_TICK;
        if (tile.fireDamage >= FIRE_CONFIG.MAX_DAMAGE) {
          if (tile.zone === ZONE.RESIDENTIAL && tile.population > 0) {
            const remainingResidents = Math.max(0, tile.population - (tile.fireDisplacedPopulation || 0));
            stats.displacedPopulation = (stats.displacedPopulation || 0) + remainingResidents;
          }
          grid.bulldoze(tile.x, tile.y);
          tile.destroyed = true;
          tile.onFire = false;
          tile.fireDamage = 0;
          tile.fireRepair = 1;
          grid.activeFireTiles.delete(tile);
        }
    }

    for (const tile of burningTiles) {
      if (!tile.onFire) continue;
      for (const neighbor of grid.getNeighbors8(tile.x, tile.y)) {
        if (neighbor.onFire || neighbor.destroyed) continue;
        if (!this.isFlammable(neighbor)) continue;
        const spreadChance = tile.terrain === TERRAIN.FOREST && neighbor.terrain === TERRAIN.FOREST
          ? FIRE_CONFIG.FOREST_SPREAD_CHANCE_PER_TICK
          : FIRE_CONFIG.SPREAD_CHANCE_PER_TICK;
        if (Math.random() < spreadChance) {
          neighbor.onFire = true;
          neighbor.fireDamage = 0;
          if (neighbor.terrain === TERRAIN.FOREST) neighbor.forestFireInjury = null;
          grid.activeFireTiles.add(neighbor);
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
    } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL || tile.zone === ZONE.AGRICULTURAL) {
      occupied = tile.filledJobs || 0;
      capacity = tile.totalJobs || 0;
    }
    return capacity > 0 ? Math.min(1, Math.max(0, occupied / capacity)) : 0;
  }

  static getIgnitionChance(tile) {
    if (!this.isFlammable(tile)) return 0;
    if (tile.terrain === TERRAIN.FOREST) {
      return FIRE_CONFIG.FOREST_IGNITION_CHANCE;
    }
    if (tile.zone === ZONE.NONE) {
      return tile.producer ? FIRE_CONFIG.BASE_IGNITION_CHANCE : 0;
    }

    const occupancy = this.getOccupancyRatio(tile);
    if (occupancy <= 0 && !tile.producer) return 0;

    const maxChance = tile.zone === ZONE.INDUSTRIAL
      ? FIRE_CONFIG.MAX_IGNITION_CHANCE_INDUSTRIAL
      : FIRE_CONFIG.MAX_IGNITION_CHANCE_NON_INDUSTRIAL;
    const chance = maxChance * occupancy;
    const pollutionBonus = occupancy > 0 && (tile.pollution || 0) >= FIRE_CONFIG.HIGH_POLLUTION_IGNITION_THRESHOLD
      ? FIRE_CONFIG.HIGH_POLLUTION_IGNITION_BONUS
      : 0;
    return Math.min(maxChance, chance + pollutionBonus);
  }

  // Nearest operational fire station covering this tile, mirroring ServiceManager's road-adjacency lookup.
  static findNearestStation(grid, tile) {
    if (!CoverageManager.isCovered(grid, 'fire', tile.x, tile.y)) return null;
    return grid.producers
      .filter((producer) => producer.type === PRODUCER_TYPE.FIRE_STATION && producer.operational !== false)
      .sort((a, b) => (b.filledJobs || 0) - (a.filledJobs || 0))[0] || null;
  }
}
