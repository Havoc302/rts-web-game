import { MEDICAL_CONFIG, PRODUCER_CONFIG, PRODUCER_TYPE, RENDERER_CONFIG, ZONE } from '../config.js';
import { formatProducerCapacity, getProducerConnectionStatus, getTileUtilityStatus } from './InspectorStatus.js';

function meterView(demand, capacity, formatDecimals) {
  const displayDemand = formatDecimals ? Number(demand).toFixed(2) : demand;
  const displayCapacity = formatDecimals ? Number(capacity).toFixed(2) : capacity;
  return `${displayDemand} / ${displayCapacity}`;
}

function meterFill(demand, capacity, overColor = '#ef4444') {
  const pct = capacity > 0 ? Math.min(100, Math.round((demand / capacity) * 100)) : 0;
  const color = demand > capacity ? overColor : '';
  return `${pct}%|${color}`;
}

export function formatHudTime(hour, isDay) {
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${isDay ? '☀️' : '🌙'} ${displayHour}:00 ${ampm}`;
}

export function getHudCadenceMs(isMobile) {
  return isMobile ? RENDERER_CONFIG.HUD_MOBILE_CADENCE_MS : 0;
}

export function buildHudSnapshot(simulation, treasury) {
  const stats = simulation.stats;
  const stockpile = stats.resources?.stockpile || {};
  const pollPct = stats.maxPollution > 0
    ? Math.min(100, Math.round((stats.avgPollution / Math.max(stats.maxPollution, 1)) * 100))
    : 0;
  const roundStock = (value) => String(Math.round(value || 0));

  return {
    'stat-pop': stats.population.toLocaleString(),
    'stat-cash': `$${Number(treasury).toLocaleString()}`,
    'stat-income': `+$${stats.incomePerTick.toLocaleString()}`,
    'stat-service-expenses': `-$${stats.serviceExpenses.toLocaleString()}`,
    'stat-road-expenses': `-$${stats.roadExpenses.toLocaleString()}`,
    'stat-tick': String(simulation.tickCount),
    'stat-time': formatHudTime(simulation.getHourOfDay(), simulation.isDaytime()),
    'stat-jobs-avail': stats.jobsAvailable.toLocaleString(),
    'stat-emp-rate': `${Math.round(stats.employmentRate * 100)}%`,
    'stat-workforce': (stats.totalEmployablePopulation || 0).toLocaleString(),
    'stat-school-age': (stats.schoolAge || 0).toLocaleString(),
    'stat-retirees': (stats.retirees || 0).toLocaleString(),
    'stat-food': roundStock(stockpile.food),
    'stat-coal': roundStock(stockpile.coal),
    'stat-iron': roundStock(stockpile.ironOre),
    'stat-bauxite': roundStock(stockpile.bauxiteOre),
    'stat-iron-bar': roundStock(stockpile.ironBar),
    'stat-bauxite-bar': roundStock(stockpile.bauxiteBar),
    'stat-oil': roundStock(stockpile.oil),
    'stat-fuel': roundStock(stockpile.fuel),
    'stat-goods': roundStock(stockpile.consumerGoods),
    'stat-arms': roundStock(stockpile.arms),
    'stat-tanks': roundStock(stockpile.tanks),
    'stat-happiness': String(Math.round(stats.happiness ?? 0)),
    'meter-power-text': meterView(stats.powerDemand, stats.powerCapacity, true),
    'meter-power-fill': meterFill(stats.powerDemand, stats.powerCapacity),
    'meter-water-text': meterView(stats.waterDemand, stats.waterCapacity, true),
    'meter-water-fill': meterFill(stats.waterDemand, stats.waterCapacity),
    'meter-sewage-text': meterView(stats.sewageDemand, stats.sewageCapacity, true),
    'meter-sewage-fill': meterFill(stats.sewageDemand, stats.sewageCapacity),
    'meter-hospital-text': meterView(stats.patientDemand, stats.patientCapacity, false),
    'meter-hospital-fill': meterFill(stats.patientDemand, stats.patientCapacity),
    'meter-fuel-text': meterView(stats.fuelDemand || 0, stockpile.fuel || 0, true),
    'meter-fuel-fill': meterFill(stats.fuelDemand || 0, stockpile.fuel || 0),
    'meter-pollution-text': `Avg ${stats.avgPollution} / Max ${stats.maxPollution}`,
    'meter-pollution-fill': `${pollPct}%|`,
  };
}

export function changedHudFields(prev, next) {
  if (!prev) return Object.keys(next);
  const changed = [];
  for (const key of Object.keys(next)) {
    if (prev[key] !== next[key]) changed.push(key);
  }
  return changed;
}

export function shouldRefreshUi({ force = false, fieldCount = 0, now = 0, lastAppliedAt = null, cadenceMs = 0 } = {}) {
  if (force) return true;
  if (fieldCount <= 0) return false;
  if (cadenceMs > 0 && lastAppliedAt != null && now - lastAppliedAt < cadenceMs) return false;
  return true;
}

export function applyHudSnapshot(snapshot, changedKeys, documentRef) {
  let wrote = 0;
  for (const key of changedKeys) {
    const el = documentRef.getElementById(key);
    if (!el) continue;
    const value = snapshot[key];
    if (key.endsWith('-fill')) {
      const sep = value.indexOf('|');
      const width = sep >= 0 ? value.slice(0, sep) : value;
      const color = sep >= 0 ? value.slice(sep + 1) : '';
      if (el.style.width !== width) el.style.width = width;
      el.style.backgroundColor = color;
      wrote += 1;
    } else if (el.textContent !== value) {
      el.textContent = value;
      wrote += 1;
    }
  }
  return wrote;
}

export function buildInspectorSignature(grid, tile) {
  if (!tile) return '';
  const producer = tile.producer;
  const connectionStatus = producer ? getProducerConnectionStatus(grid, producer) : null;
  const isConnected = connectionStatus ? connectionStatus.isConnected : grid.isRoadAdjacent(tile.x, tile.y);
  const config = producer ? PRODUCER_CONFIG[producer.type] : null;
  let producerCap = '';
  if (producer) {
    const isBatteryDependent = producer.type === PRODUCER_TYPE.WINDMILL || producer.type === PRODUCER_TYPE.SOLAR_PANEL;
    if (isBatteryDependent && !producer.hasBatteryConnection) {
      producerCap = 'offline-battery';
    } else if (producer.type === PRODUCER_TYPE.HOSPITAL || producer.type === PRODUCER_TYPE.CLINIC) {
      const staff = producer.filledJobs || 0;
      producerCap = `patients:${staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB}:${staff}`;
    } else if (config?.utility === 'power' || config?.utility === 'water' || config?.utility === 'sewage' || producer.type === PRODUCER_TYPE.BATTERY) {
      producerCap = formatProducerCapacity(producer, grid);
    } else if (config?.jobs) {
      producerCap = `staff:${producer.filledJobs || 0}:${producer.totalJobs || 0}`;
    }
  }

  return [
    tile.x,
    tile.y,
    tile.terrain,
    tile.hasBridge ? 'bridge' : tile.hasRoad ? 'road' : 'none',
    tile.zone,
    tile.density,
    tile.population || 0,
    tile.maxPopulation || 0,
    tile.filledJobs || 0,
    tile.totalJobs || 0,
    tile.recipe || '',
    producer?.storageType || '',
    Number(tile.growthScore || 0).toFixed(2),
    tile.pollution || 0,
    tile.crime || 0,
    tile.onFire ? 1 : 0,
    Math.round(tile.fireDamage || 0),
    Math.round((tile.fireRepair ?? 1) * 100),
    tile.oreDiscovered ? 1 : 0,
    tile.discoveredOre || '',
    tile.surveyingBy || '',
    tile.surveyProgress || 0,
    tile.surveyRequired || 0,
    isConnected ? 1 : 0,
    getTileUtilityStatus(grid, tile, 'power'),
    getTileUtilityStatus(grid, tile, 'water'),
    getTileUtilityStatus(grid, tile, 'sewage'),
    producer?.type || '',
    producer?.operational ? 1 : 0,
    producer?.contaminated ? 1 : 0,
    producer?.hasBatteryConnection ? 1 : 0,
    producerCap,
    connectionStatus?.message || '',
    tile.zone === ZONE.RESIDENTIAL ? 1 : 0,
  ].join('|');
}

export function createUiTimingBucket() {
  return { calls: 0, applied: 0, skipped: 0, totalMs: 0 };
}

export function recordUiTiming(bucket, ms, applied) {
  bucket.calls += 1;
  if (applied) {
    bucket.applied += 1;
    bucket.totalMs += ms;
  } else {
    bucket.skipped += 1;
  }
}

export function uiTimingAverages(bucket) {
  return {
    calls: bucket.calls,
    applied: bucket.applied,
    skipped: bucket.skipped,
    averageMs: bucket.applied > 0 ? bucket.totalMs / bucket.applied : 0,
  };
}
