import { PRODUCER_TYPE, PRODUCER_CONFIG, SERVICE_GLOBAL_CONFIG, USAGE_RATES, POWER_PRODUCER_TYPES, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, DAY_START_HOUR, NIGHT_START_HOUR } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class UtilityManager {
  static allocateAll(grid, hourOfDay = 12) {
    this.updatePowerGeneration(grid, hourOfDay);
    this.allocateUtility(grid, POWER_PRODUCER_TYPES, 'power', 'ascending');
    this.settleBatteries(grid);
    this.chargeBatteries(grid);
    this.allocateUtility(grid, PRODUCER_TYPE.WATER_TOWER, 'water', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.SEWAGE_PLANT, 'sewage', 'descending');
    this.allocateUtilityConsumers(grid);
  }

  // Windmill output swings randomly each tick, solar follows a sunrise-to-sunset
  // bell curve, and batteries can only discharge what they currently hold in storage.
  // Windmills/solar panels also need a Battery Storage building adjacent (including
  // diagonals) to actually transmit their power to the grid.
  static updatePowerGeneration(grid, hourOfDay) {
    for (const p of grid.producers) {
      if (p.type === PRODUCER_TYPE.WINDMILL || p.type === PRODUCER_TYPE.SOLAR_PANEL) {
        p.hasBatteryConnection = this.hasAdjacentBattery(grid, p.x, p.y);
        if (!p.hasBatteryConnection) {
          p.capacity = 0;
          continue;
        }
        if (p.type === PRODUCER_TYPE.WINDMILL) {
          const swing = (Math.random() * 2 - 1) * WIND_CONFIG.FLUCTUATION;
          p.capacity = Math.max(WIND_CONFIG.MIN_CAPACITY, Math.round(WIND_CONFIG.BASE_CAPACITY + swing));
        } else {
          p.capacity = Math.round(SOLAR_CONFIG.PEAK_CAPACITY * this.solarOutputFactor(hourOfDay));
        }
      } else if (p.type === PRODUCER_TYPE.BATTERY) {
        p.capacity = Math.min(BATTERY_CONFIG.DISCHARGE_RATE, Math.floor(p.storedEnergy || 0));
      }
    }
  }

  static hasAdjacentBattery(grid, x, y) {
    return grid.getNeighbors8(x, y).some((tile) => tile.producer && tile.producer.type === PRODUCER_TYPE.BATTERY);
  }

  static solarOutputFactor(hourOfDay) {
    if (hourOfDay < DAY_START_HOUR || hourOfDay >= NIGHT_START_HOUR) return 0;
    const span = NIGHT_START_HOUR - DAY_START_HOUR;
    return Math.max(0, Math.sin((Math.PI * (hourOfDay - DAY_START_HOUR)) / span));
  }

  // Batteries deplete by whatever they discharged this tick before recharging.
  static settleBatteries(grid) {
    for (const p of grid.producers) {
      if (p.type !== PRODUCER_TYPE.BATTERY) continue;
      p.storedEnergy = Math.max(0, (p.storedEnergy || 0) - (p.usedCapacity || 0));
    }
  }

  // Batteries recharge from power that was generated but never allocated to demand.
  static chargeBatteries(grid) {
    const batteries = grid.producers.filter((p) => p.type === PRODUCER_TYPE.BATTERY);
    if (batteries.length === 0) return;

    let surplus = grid.producers
      .filter((p) => POWER_PRODUCER_TYPES.includes(p.type) && p.type !== PRODUCER_TYPE.BATTERY)
      .reduce((sum, p) => sum + Math.max(0, p.capacity - p.usedCapacity), 0);

    for (const battery of batteries) {
      if (surplus <= 0) break;
      const headroom = (battery.maxStorage || 0) - (battery.storedEnergy || 0);
      const charge = Math.min(surplus, headroom);
      battery.storedEnergy = (battery.storedEnergy || 0) + charge;
      surplus -= charge;
    }
  }

  // Every producer with a `utilityUsage` config consumes power/water/sewage from
  // the nearest connected source of each (except the utility it produces itself).
  // Covers civic services, Survey Station, and now the power/water/sewage
  // producers too, so they show up as connected consumers in the Tile Inspector.
  static allocateUtilityConsumers(grid) {
    const utilitySources = {
      power: POWER_PRODUCER_TYPES,
      water: PRODUCER_TYPE.WATER_TOWER,
      sewage: PRODUCER_TYPE.SEWAGE_PLANT,
    };

    // Distances from producers-of-type-X to all roads don't change within a tick,
    // so compute each utility's road-distance map once and reuse it for every consumer.
    const roadDistancesByUtility = {};
    for (const [utilityKey, sourceType] of Object.entries(utilitySources)) {
      roadDistancesByUtility[utilityKey] = RoadNetwork.computeProducerDistances(grid, sourceType).roadDistancesMap;
    }

    for (const producer of grid.producers) {
      const config = PRODUCER_CONFIG[producer.type];
      const usage = config?.utilityUsage;
      if (!usage) continue;

      producer.utilityShortfall = { power: false, water: false, sewage: false };
      let hasUtilityShortfall = false;
      const activeUsage = producer.type === PRODUCER_TYPE.SURVEY_STATION && producer.surveyTarget
        ? config.activeUtilityUsage || {}
        : {};

      for (const [utilityKey] of Object.entries(utilitySources)) {
        const required = (usage[utilityKey] || 0) + (activeUsage[utilityKey] || 0);
        if (required <= 0) continue;

        const roadDistancesMap = roadDistancesByUtility[utilityKey];
        const candidates = [];
        for (const neighbor of grid.getNeighbors(producer.x, producer.y)) {
          if (!neighbor.hasRoad) continue;
          const entries = roadDistancesMap.get(`${neighbor.x},${neighbor.y}`) || new Map();
          for (const info of entries.values()) candidates.push(info);
        }
        candidates.sort((a, b) => a.distance - b.distance);
        const available = candidates.find((info) => info.producer.capacity - info.producer.usedCapacity >= required);
        if (available) {
          available.producer.usedCapacity += required;
        } else {
          producer.utilityShortfall[utilityKey] = true;
          hasUtilityShortfall = true;
        }
      }

      if (hasUtilityShortfall) {
        producer.utilityFailureTicks = (producer.utilityFailureTicks || 0) + 1;
        producer.operational = producer.utilityFailureTicks <= SERVICE_GLOBAL_CONFIG.UTILITY_FAILURE_GRACE_TICKS;
      } else {
        producer.utilityFailureTicks = 0;
        producer.operational = true;
      }
    }
  }

  static allocateUtility(grid, producerType, utilityKey, sortOrder = 'ascending') {
    const types = Array.isArray(producerType) ? producerType : [producerType];
    const producers = grid.producers.filter((p) => types.includes(p.type));

    producers.forEach((p) => {
      p.usedCapacity = 0;
    });

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.getTile(x, y);
        if (tile && tile.zone !== 'none') {
          tile.shortfall[utilityKey] = true;
          tile.distanceToProducer[utilityKey] = Infinity;
        }
      }
    }

    if (producers.length === 0) {
      return;
    }

    const { connectedZonedTiles } = RoadNetwork.computeProducerDistances(grid, producerType);

    connectedZonedTiles.forEach((item) => {
      item.tile.distanceToProducer[utilityKey] = item.distance;
    });

    if (sortOrder === 'ascending') {
      connectedZonedTiles.sort((a, b) => a.distance - b.distance);
    } else {
      connectedZonedTiles.sort((a, b) => b.distance - a.distance);
    }

    for (const item of connectedZonedTiles) {
      const tile = item.tile;
      const usage = this.getTileUtilityUsage(tile, utilityKey);

      let chosenProducer = null;

      // First try candidate producers at the same minimum distance
      let bestCap = -1;
      for (const prod of item.candidateProducers) {
        if (prod.contaminated) continue;
        const remaining = prod.capacity - prod.usedCapacity;
        if (remaining >= usage && remaining > bestCap) {
          bestCap = remaining;
          chosenProducer = prod;
        }
      }

      // Fallback to any connected producer of this type with sufficient remaining capacity
      if (!chosenProducer && item.allCandidatesSorted) {
        for (const candidateInfo of item.allCandidatesSorted) {
          const prod = candidateInfo.producer;
          if (prod.contaminated) continue;
          const remaining = prod.capacity - prod.usedCapacity;
          if (remaining >= usage) {
            chosenProducer = prod;
            break;
          }
        }
      }

      if (chosenProducer) {
        chosenProducer.usedCapacity += usage;
        tile.shortfall[utilityKey] = false;
      } else {
        tile.shortfall[utilityKey] = true;
      }
    }
  }

  static getTileOccupancyRatio(tile) {
    if (tile.destroyed) return 0;

    let occupied = 0;
    let capacity = 0;
    if (tile.zone === 'residential') {
      occupied = tile.population || 0;
      capacity = tile.maxPopulation || 0;
    } else if (tile.zone === 'commercial' || tile.zone === 'industrial') {
      occupied = tile.filledJobs || 0;
      capacity = tile.totalJobs || 0;
    }
    return capacity > 0 ? Math.min(1, Math.max(0, occupied / capacity)) : 0;
  }

  static getTileUtilityUsage(tile, utilityKey) {
    const baseUsage = USAGE_RATES[tile.zone]?.[tile.density]?.[utilityKey] || 0;
    return baseUsage * this.getTileOccupancyRatio(tile);
  }
}
