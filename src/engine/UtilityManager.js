import { PRODUCER_TYPE, USAGE_RATES } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class UtilityManager {
  static allocateAll(grid) {
    this.allocateUtility(grid, PRODUCER_TYPE.POWER_PLANT, 'power', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.WATER_TOWER, 'water', 'ascending');
    this.allocateUtility(grid, PRODUCER_TYPE.SEWAGE_PLANT, 'sewage', 'descending');
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
