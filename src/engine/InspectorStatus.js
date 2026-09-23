import { PRODUCER_TYPE, PRODUCER_CONFIG, POWER_PRODUCER_TYPES } from '../config.js';
import { UtilityManager } from './UtilityManager.js';

export function getProducerConnectionStatus(grid, producer) {
  const isBatteryDependent = producer?.type === PRODUCER_TYPE.WINDMILL ||
    producer?.type === PRODUCER_TYPE.SOLAR_PANEL;
  if (!isBatteryDependent) {
    return {
      isBatteryDependent: false,
      isConnected: grid.isRoadAdjacent(producer.x, producer.y),
      message: null,
    };
  }

  const battery = UtilityManager.getAdjacentBattery(grid, producer.x, producer.y);
  if (!battery) {
    return { isBatteryDependent: true, isConnected: false, message: 'Needs adjacent Battery Storage' };
  }
  if (!grid.isRoadAdjacent(battery.x, battery.y)) {
    return { isBatteryDependent: true, isConnected: false, message: 'Battery Storage needs road' };
  }
  return { isBatteryDependent: true, isConnected: true, message: 'Connected via Battery Storage' };
}

export function getTileUtilityStatus(grid, tile, key) {
  if (!tile) return 'Not Required';
  const connectionStatus = tile.producer
    ? getProducerConnectionStatus(grid, tile.producer)
    : null;
  const isBatteryDependent = connectionStatus?.isBatteryDependent;
  const isConnected = connectionStatus ? connectionStatus.isConnected : grid.isRoadAdjacent(tile.x, tile.y);

  if (tile.producer) {
    const producerConfig = PRODUCER_CONFIG[tile.producer.type];
    if (producerConfig?.utility === key) {
      return 'Produces This Utility';
    }
    if (isBatteryDependent) return 'Not Required';
    const usage = producerConfig?.utilityUsage;
    if (usage && (usage[key] > 0 || producerConfig?.activeUtilityUsage?.[key] > 0)) {
      if (!isConnected) return 'No Local Road';
      return tile.producer.utilityShortfall?.[key] ? 'Shortfall (Building Offline)' : 'Serviced';
    }
    return 'Not Required';
  }

  const d = tile.distanceToProducer?.[key];
  if (d === undefined || d === Infinity) {
    if (!isConnected) return 'No Local Road';
    const prods = key === 'power'
      ? grid.producers.filter((p) => POWER_PRODUCER_TYPES.includes(p.type))
      : grid.producers.filter((p) => p.type === (key === 'water' ? PRODUCER_TYPE.WATER_TOWER : PRODUCER_TYPE.SEWAGE_PLANT));
    if (prods.length === 0) return 'No Producer Built';
    const prodHasRoad = prods.some((p) => grid.isRoadAdjacent(p.x, p.y));
    if (!prodHasRoad) return 'Producer Needs Road!';
    return 'Unconnected Road Network!';
  }
  return tile.shortfall?.[key] ? `Dist ${d} (Plant Full!)` : `Dist ${d} (Serviced)`;
}

export function formatProducerCapacity(producer, grid = null) {
  if (!producer) return 'N/A';
  const isBatteryDependent = producer.type === PRODUCER_TYPE.WINDMILL ||
    producer.type === PRODUCER_TYPE.SOLAR_PANEL;
  if (isBatteryDependent) {
    const hasConnection = grid
      ? getProducerConnectionStatus(grid, producer).isConnected
      : producer.hasBatteryConnection;
    if (!hasConnection) {
      return '⚠️ Offline (Must be adjacent to Battery Storage)';
    }
  }
  const used = Number(producer.usedCapacity ?? 0).toFixed(2);
  const cap = Number(producer.capacity ?? 0).toFixed(2);

  if (producer.type === PRODUCER_TYPE.BATTERY) {
    const stored = Number(producer.storedEnergy ?? 0).toFixed(2);
    const max = Number(producer.maxStorage ?? 0).toFixed(2);
    return `${used} / ${cap} (Stored: ${stored} / ${max})`;
  }
  return `${used} / ${cap}`;
}