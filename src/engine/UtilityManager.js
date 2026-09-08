import { PRODUCER_TYPE, PRODUCER_CONFIG, USAGE_RATES } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class UtilityManager {
  static allocateAll(grid) {
    this.allocateUtility(grid, PRODUCER_TYPE.POWER_PLANT, 'power', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.WATER_TOWER, 'water', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.SEWAGE_PLANT, 'sewage', 'descending');
    this.allocateServiceUtilities(grid);
    this.allocateSurveyUtilities(grid);
  }

  static allocateServiceUtilities(grid) {
    const utilitySources = {
      power: PRODUCER_TYPE.POWER_PLANT,
      water: PRODUCER_TYPE.WATER_TOWER,
      sewage: PRODUCER_TYPE.SEWAGE_PLANT,
    };
    const serviceTypes = [
      PRODUCER_TYPE.POLICE_STATION,
      PRODUCER_TYPE.FIRE_STATION,
      PRODUCER_TYPE.HOSPITAL,
    ];

    for (const producer of grid.producers.filter((item) => serviceTypes.includes(item.type))) {
      const usage = PRODUCER_CONFIG[producer.type]?.utilityUsage || {};
      producer.utilityShortfall = { power: false, water: false, sewage: false };
      producer.operational = true;

      for (const [utilityKey, sourceType] of Object.entries(utilitySources)) {
        const required = usage[utilityKey] || 0;
        const { roadDistancesMap } = RoadNetwork.computeProducerDistances(grid, sourceType);
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
          producer.operational = false;
        }
      }
    }
  }

  static allocateSurveyUtilities(grid) {
    const utilitySources = {
      power: PRODUCER_TYPE.POWER_PLANT,
      water: PRODUCER_TYPE.WATER_TOWER,
      sewage: PRODUCER_TYPE.SEWAGE_PLANT,
    };
    const surveyors = grid.producers.filter((producer) => producer.type === PRODUCER_TYPE.SURVEY_STATION);

    for (const surveyor of surveyors) {
      surveyor.utilityShortfall = { power: false, water: false, sewage: false };
      surveyor.operational = true;
      const usage = PRODUCER_CONFIG[PRODUCER_TYPE.SURVEY_STATION]?.utilityUsage || {};
      const activeUsage = surveyor.surveyTarget
        ? PRODUCER_CONFIG[PRODUCER_TYPE.SURVEY_STATION]?.activeUtilityUsage || {}
        : {};

      for (const [utilityKey, sourceType] of Object.entries(utilitySources)) {
        const required = (usage[utilityKey] || 0) + (activeUsage[utilityKey] || 0);
        const { roadDistancesMap } = RoadNetwork.computeProducerDistances(grid, sourceType);
        const candidates = [];
        for (const neighbor of grid.getNeighbors(surveyor.x, surveyor.y)) {
          if (!neighbor.hasRoad) continue;
          const entries = roadDistancesMap.get(`${neighbor.x},${neighbor.y}`) || new Map();
          for (const info of entries.values()) {
            candidates.push(info);
          }
        }

        candidates.sort((a, b) => a.distance - b.distance);
        const available = candidates.find((info) => info.producer.capacity - info.producer.usedCapacity >= required);
        if (available) {
          available.producer.usedCapacity += required;
        } else {
          surveyor.utilityShortfall[utilityKey] = true;
          surveyor.operational = false;
        }
      }
    }
  }

  static allocateUtility(grid, producerType, utilityKey, sortOrder = 'ascending') {
    const producers = grid.producers.filter((p) => p.type === producerType);

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
      const usage = USAGE_RATES[tile.zone]?.[tile.density]?.[utilityKey] || 0;

      let chosenProducer = null;

      // First try candidate producers at the same minimum distance
      let bestCap = -1;
      for (const prod of item.candidateProducers) {
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
}
