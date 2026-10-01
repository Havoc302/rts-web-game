import { PRODUCER_TYPE, PRODUCER_CONFIG, SERVICE_GLOBAL_CONFIG, USAGE_RATES, POWER_PRODUCER_TYPES, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, DAY_START_HOUR, NIGHT_START_HOUR, WEATHER_CONFIG } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class UtilityManager {
  // preview=true: HUD-only. Recompute usedCapacity against persisted generation;
  // do not reroll wind, discharge/charge batteries, or write storedEnergy.
  static allocateAll(grid, hourOfDay = 12, weatherManager = null, { preview = false } = {}) {
    if (!preview) {
      this.updatePowerGeneration(grid, hourOfDay, weatherManager);
    }
    for (const producer of grid.producers) {
      if (POWER_PRODUCER_TYPES.includes(producer.type)) producer.usedCapacity = 0;
    }
    this.allocateUtility(grid, this.getRenewablePowerProducerTypes(), 'power', 'none');
    this.allocateUtility(grid, [PRODUCER_TYPE.BATTERY], 'power', 'none', false);
    this.allocateUtility(grid, this.getDispatchablePowerProducerTypes(), 'power', 'none', false);
    this.allocateUtility(grid, PRODUCER_TYPE.WATER_TOWER, 'water', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.SEWAGE_PLANT, 'sewage', 'descending');
    this.allocateUtilityConsumers(grid);
    let hasPowerShortfall = grid.producers.some((producer) => producer.utilityShortfall?.power);
    for (const tile of grid.getActiveZonedTiles()) {
      if (tile.shortfall.power && this.getTileUtilityUsage(tile, 'power') > 0) {
        hasPowerShortfall = true;
        break;
      }
    }
    if (hasPowerShortfall) this.allocatePowerByDistance(grid);
    this.updateProducerOperationalState(grid);
    if (!preview) {
      this.settleBatteries(grid);
      this.chargeRenewableSurplus(grid);
      this.chargeDispatchableSurplus(grid);
    }
  }

  static getAdjacentBattery(grid, x, y) {
    return grid.getNeighbors8(x, y).find((tile) => tile.producer && tile.producer.type === PRODUCER_TYPE.BATTERY)?.producer || null;
  }

  // Wind/solar are passive generators. They only need an adjacent battery whose
  // tile is road-adjacent; they do not consume the battery's utilities.
  static contributesPowerToGrid(grid, producer) {
    if (!producer || producer.destroyed) return false;
    if (producer.type === PRODUCER_TYPE.WINDMILL || producer.type === PRODUCER_TYPE.SOLAR_PANEL) {
      const battery = this.getAdjacentBattery(grid, producer.x, producer.y);
      return Boolean(battery && grid.isRoadAdjacent(battery.x, battery.y));
    }
    return grid.isRoadAdjacent(producer.x, producer.y);
  }

  // Windmill output scales with wind intensity, solar with the day curve and cloud
  // cover, and batteries can only discharge what they currently hold in storage.
  // Windmills/solar panels also need a Battery Storage building adjacent (including
  // diagonals) to actually transmit their power to the grid.
  static updatePowerGeneration(grid, hourOfDay, weatherManager = null) {
    const windIntensity = weatherManager?.windIntensity ?? 0.5;
    const solarEfficiency = weatherManager?.getSolarEfficiency?.() ?? 1.0;
    const overspeed = (weatherManager?.extremeWindTicks ?? 0) > 1;
    for (const p of grid.producers) {
      if (p.type === PRODUCER_TYPE.WINDMILL && overspeed && p.operational && !p.destroyed) {
        const tile = grid.getTile(p.x, p.y);
        if (tile && !tile.onFire && Math.random() < (WEATHER_CONFIG.WIND_IGNITION_CHANCE ?? 0.25)) {
          tile.onFire = true;
          tile.fireDamage = 10;
          grid.activeFireTiles.add(tile);
        }
      }
      if (p.type === PRODUCER_TYPE.WINDMILL || p.type === PRODUCER_TYPE.SOLAR_PANEL) {
        const battery = this.getAdjacentBattery(grid, p.x, p.y);
        p.hasBatteryConnection = Boolean(battery);
        if (!battery || !grid.isRoadAdjacent(battery.x, battery.y)) {
          p.capacity = 0;
          p.gridConnectionX = null;
          p.gridConnectionY = null;
          continue;
        }
        p.gridConnectionX = battery.x;
        p.gridConnectionY = battery.y;
        if (p.type === PRODUCER_TYPE.WINDMILL) {
          p.capacity = Math.round((WIND_CONFIG.MAX_CAPACITY || 65) * windIntensity);
        } else {
          p.capacity = Math.round(SOLAR_CONFIG.PEAK_CAPACITY * this.solarOutputFactor(hourOfDay) * solarEfficiency);
        }
      } else if (p.type === PRODUCER_TYPE.BATTERY) {
        p.capacity = Math.min(BATTERY_CONFIG.DISCHARGE_RATE, Math.floor(p.storedEnergy || 0));
      }
    }
  }

  static getRenewablePowerProducerTypes() {
    return [PRODUCER_TYPE.WINDMILL, PRODUCER_TYPE.SOLAR_PANEL];
  }

  static getDispatchablePowerProducerTypes() {
    return POWER_PRODUCER_TYPES.filter((type) => (
      type !== PRODUCER_TYPE.WINDMILL &&
      type !== PRODUCER_TYPE.SOLAR_PANEL &&
      type !== PRODUCER_TYPE.BATTERY
    ));
  }

  // Renewables serve live demand first. Only their unused output charges the
  // adjacent battery, so storage cannot charge and discharge in the same tick.
  static chargeRenewableSurplus(grid) {
    for (const producer of grid.producers) {
      if (producer.type !== PRODUCER_TYPE.WINDMILL && producer.type !== PRODUCER_TYPE.SOLAR_PANEL) continue;
      const battery = this.getAdjacentBattery(grid, producer.x, producer.y);
      if (!battery || !grid.isRoadAdjacent(battery.x, battery.y)) continue;
      const charge = Math.min(
        Math.max(0, (producer.capacity || 0) - (producer.usedCapacity || 0)),
        Math.max(0, (battery.maxStorage || 0) - (battery.storedEnergy || 0)),
      );
      battery.storedEnergy = (battery.storedEnergy || 0) + charge;
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
  static chargeDispatchableSurplus(grid) {
    const batteries = grid.producers.filter((p) => p.type === PRODUCER_TYPE.BATTERY);
    if (batteries.length === 0) return;

    let surplus = grid.producers
      .filter((p) => this.getDispatchablePowerProducerTypes().includes(p.type) && this.contributesPowerToGrid(grid, p))
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
        }
      }
    }
  }

  static updateProducerOperationalState(grid) {
    for (const producer of grid.producers) {
      if (!PRODUCER_CONFIG[producer.type]?.utilityUsage) continue;
      const hasUtilityShortfall = Object.values(producer.utilityShortfall).some(Boolean);
      if (hasUtilityShortfall) {
        producer.utilityFailureTicks = (producer.utilityFailureTicks || 0) + 1;
        producer.operational = producer.utilityFailureTicks <= SERVICE_GLOBAL_CONFIG.UTILITY_FAILURE_GRACE_TICKS;
      } else {
        producer.utilityFailureTicks = 0;
        producer.operational = true;
      }
    }
  }

  static allocatePowerByDistance(grid) {
    const { roadDistancesMap, connectedZonedTiles } = RoadNetwork.computeProducerDistances(grid, POWER_PRODUCER_TYPES);
    for (const producer of grid.producers) {
      if (POWER_PRODUCER_TYPES.includes(producer.type)) producer.usedCapacity = 0;
    }

    const consumers = connectedZonedTiles.map((item) => ({
      tile: item.tile,
      distance: item.distance,
      candidates: item.allCandidatesSorted,
      required: this.getTileUtilityUsage(item.tile, 'power'),
    }));
    for (const producer of grid.producers) {
      const config = PRODUCER_CONFIG[producer.type];
      const active = producer.type === PRODUCER_TYPE.SURVEY_STATION && producer.surveyTarget ? config?.activeUtilityUsage?.power || 0 : 0;
      const required = (config?.utilityUsage?.power || 0) + active;
      if (required <= 0) continue;
      const choices = new Map();
      for (const neighbor of grid.getNeighbors(producer.x, producer.y)) {
        if (!neighbor.hasRoad) continue;
        for (const [id, info] of roadDistancesMap.get(`${neighbor.x},${neighbor.y}`) || []) {
          if (!choices.has(id) || choices.get(id).distance > info.distance) choices.set(id, info);
        }
      }
      const candidates = Array.from(choices.values()).sort((a, b) => a.distance - b.distance);
      consumers.push({ producer, distance: candidates[0]?.distance ?? Infinity, candidates, required });
    }

    for (const tile of grid.getActiveZonedTiles()) {
      tile.shortfall.power = true;
      tile.distanceToProducer.power = Infinity;
    }
    consumers.sort((a, b) => a.distance - b.distance || Number(Boolean(b.producer)) - Number(Boolean(a.producer)));
    for (const consumer of consumers) {
      const source = consumer.candidates.find(({ producer }) =>
        !producer.contaminated && producer.capacity - producer.usedCapacity >= consumer.required
      )?.producer;
      if (source) source.usedCapacity += consumer.required;
      if (consumer.tile) {
        consumer.tile.shortfall.power = !source;
        consumer.tile.distanceToProducer.power = consumer.distance;
      } else {
        consumer.producer.utilityShortfall.power = !source;
      }
    }
  }

  static allocateUtility(grid, producerType, utilityKey, sortOrder = 'ascending', reset = true) {
    const types = Array.isArray(producerType) ? producerType : [producerType];
    const producers = grid.producers.filter((p) => types.includes(p.type));

    if (reset) {
      producers.forEach((p) => {
        p.usedCapacity = 0;
      });
    }

    if (reset) {
      for (const tile of grid.getActiveZonedTiles()) {
        tile.shortfall[utilityKey] = true;
        tile.distanceToProducer[utilityKey] = Infinity;
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
      if (!reset && !tile.shortfall[utilityKey]) continue;
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
    } else if (tile.zone === 'commercial' || tile.zone === 'industrial' || tile.zone === 'agricultural') {
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
