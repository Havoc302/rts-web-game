import { PRODUCER_TYPE, PRODUCER_CONFIG, POWER_PRODUCER_TYPES, RESOURCE_CONFIG } from '../config.js';
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

export function formatDerrickOutput(producer, stockpile = {}, capacity = {}) {
  const jobs = producer.totalJobs || PRODUCER_CONFIG[PRODUCER_TYPE.OIL_DERRICK].jobs.light;
  const staff = producer.filledJobs || 0;
  const fill = jobs > 0 ? Math.min(1, staff / jobs) : 0;
  const rate = producer.operational ? Math.round(RESOURCE_CONFIG.OIL_DERRICK_OUTPUT_PER_TICK * fill) : 0;
  const stored = Math.round(stockpile.oil || 0);
  const cap = Math.round(capacity.oil || 0);
  const head = `${rate} oil/tick (${staff}/${jobs} staff)`;
  if (!producer.operational) return `⚠️ Offline (needs utilities) — ${head}`;
  if (cap <= 0) return `${head} — ⚠️ No powered oil Silo, output is discarded`;
  if (stored >= cap) return `${head} — ⚠️ Oil storage full (${stored} / ${cap})`;
  return `${head} → oil stored ${stored} / ${cap}`;
}

export function formatSiloStorage(producer, stockpile = {}, capacity = {}) {
  const type = producer.storageType || 'oil';
  if (!producer.operational) return `⚠️ Offline (needs power) — holds ${RESOURCE_CONFIG.SILO_CAPACITY} ${type}`;
  const stored = Math.round(stockpile[type] || 0);
  const cap = Math.round(capacity[type] || 0);
  return `${stored} / ${cap} ${type} (city) — this silo: ${RESOURCE_CONFIG.SILO_CAPACITY}`;
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