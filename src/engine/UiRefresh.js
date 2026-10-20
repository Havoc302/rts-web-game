import { DAY_START_HOUR, MEDICAL_CONFIG, NIGHT_START_HOUR, PRODUCER_CONFIG, PRODUCER_TYPE, RENDERER_CONFIG, ZONE, temperaturePowerFactor } from '../config.js';
import { formatDerrickOutput, formatProducerCapacity, formatSiloStorage, getProducerConnectionStatus, getTileUtilityStatus } from './InspectorStatus.js';

// Money is displayed in whole dollars everywhere. The ledger may still carry cents
// internally (loan interest), but players never see fractional currency.
export function formatMoney(value) {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded < 0 ? '-' : ''}$${Math.abs(rounded).toLocaleString()}`;
}

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

// Thresholds match WeatherManager.getWeatherLabel().
export function weatherIcons(weather, isDay) {
  if (!weather) return isDay ? '☀️' : '🌙';
  const cloud = weather.cloudCover;
  const wind = weather.windIntensity;
  let sky;
  if (cloud > 0.7) sky = '🌧️';
  else if (cloud > 0.4) sky = isDay ? '⛅' : '☁️';
  else sky = isDay ? '☀️' : '🌙';
  const windIcon = wind > 0.7 ? '🌪️' : wind > 0.2 ? '💨' : '🍃';
  return `${sky}${windIcon}`;
}

function formatFlow(value) {
  const n = Number(value) || 0;
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1);
}

export function formatHudTime(hour, isDay) {
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${isDay ? '☀️' : '🌙'} ${displayHour}:00 ${ampm}`;
}

export function weatherSnapshot(weather, isDay, hourOfDay = null) {
  const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
  return {
    'stat-weather': weatherIcons(weather, isDay),
    'stat-weather-label': weather?.getWeatherLabel?.() ?? '-',
    'stat-weather-wind': weather ? `${pct(weather.windIntensity)}${weather.extremeWindTicks > 0 ? ' ⚠️ overspeed' : ''}` : '-',
    'stat-weather-cloud': weather ? pct(weather.cloudCover) : '-',
    'stat-weather-temp': weather ? `${Math.round(weather.temperature)}°C` : '-',
    'stat-weather-load': weather ? pct(temperaturePowerFactor(weather.temperature)) : '-',
    'stat-weather-solar': weather?.getSolarEfficiency ? pct(weather.getSolarEfficiency() * daylightFactor(hourOfDay)) : '-',
  };
}

function daylightFactor(hour) {
  if (hour == null || hour < DAY_START_HOUR || hour >= NIGHT_START_HOUR) return 0;
  return Math.max(0, Math.sin((Math.PI * (hour - DAY_START_HOUR)) / (NIGHT_START_HOUR - DAY_START_HOUR)));
}

// Per-tick money flow summary for the treasury hover. Income and the individual expense
// lines are shown unsigned with an explicit +/- prefix, and net is signed.
export function treasuryFlowSnapshot(flows = {}) {
  const income = Number(flows.income) || 0;
  const services = Number(flows.services) || 0;
  const roads = Number(flows.roads) || 0;
  const utilities = Number(flows.utilities) || 0;
  const surveys = Number(flows.surveys) || 0;
  const loans = Number(flows.loans) || 0;
  const cities = Math.max(1, Number(flows.cityCount) || 1);
  const net = income - services - roads - utilities - surveys - loans;
  return {
    'stat-cash-income': `+${formatMoney(income)}`,
    'stat-cash-service': `-${formatMoney(services)}`,
    'stat-cash-road': `-${formatMoney(roads)}`,
    'stat-cash-utility': `-${formatMoney(utilities)}`,
    'stat-cash-survey': `-${formatMoney(surveys)}`,
    'stat-cash-loans': `-${formatMoney(loans)}`,
    'stat-cash-net': `${net >= 0 ? '+' : '-'}${formatMoney(Math.abs(net))}`,
    'stat-cash-survey-row-visible': surveys > 0 ? 'flex' : 'none',
    'stat-cash-cities': String(cities),
    'stat-cash-cities-row-visible': cities > 1 ? 'flex' : 'none',
  };
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
    'alerts-panel': JSON.stringify(treasury <= 0 ? [{ id: 'treasury', message: 'Treasury is empty', x: null, y: null }, ...(stats.alerts || [])] : (stats.alerts || [])),
    'alerts-panel-visible': (treasury <= 0 || (stats.alerts || []).length > 0) ? 'block' : 'none',
    'alerts-panel-data': JSON.stringify(treasury <= 0 ? [{ id: 'treasury', message: 'Treasury is empty', x: null, y: null }, ...(stats.alerts || [])] : (stats.alerts || [])),
    'stat-pop': stats.population.toLocaleString(),
    'stat-cash': formatMoney(treasury),
    'stat-income': `+${formatMoney(stats.incomePerTick)}`,
    'stat-service-expenses': `-${formatMoney(stats.serviceExpenses)}`,
    'stat-service-breakdown': formatBreakdown(stats.serviceExpenseBreakdown),
    'stat-road-expenses': `-${formatMoney(stats.roadExpenses)}`,
    'stat-utility-expenses': `-${formatMoney(stats.utilityExpenses || 0)}`,
    'stat-school-seats': `${(stats.schoolCapacity || 0).toLocaleString()} / ${(stats.schoolDemand || 0).toLocaleString()}`,
    'stat-uni-seats': `${(stats.universityCapacity || 0).toLocaleString()} / ${(stats.universityDemand || 0).toLocaleString()}`,
    'stat-education-multiplier': `×${(stats.educationTaxMultiplier ?? 1).toFixed(2)}`,
    'stat-tick': String(simulation.tickCount),
    'stat-time': formatHudTime(simulation.getHourOfDay(), simulation.isDaytime()),
    ...weatherSnapshot(simulation.weatherManager, simulation.isDaytime(), simulation.getHourOfDay()),
    'stat-day': `Day ${Math.floor(simulation.tickCount / 24) + 1}`,
    'stat-jobs-avail': stats.jobsAvailable.toLocaleString(),
    'stat-jobs-breakdown': formatBreakdown(stats.jobsAvailableBreakdown),
    'stat-emp-rate': `${Math.round(stats.employmentRate * 100)}%`,
    'stat-employment-breakdown': formatBreakdown(stats.jobsFilledBreakdown),
    'stat-workforce': (stats.totalEmployablePopulation || 0).toLocaleString(),
    'stat-school-age': (stats.schoolAge || 0).toLocaleString(),
    'stat-retirees': (stats.retirees || 0).toLocaleString(),
    'stat-food': roundStock(stockpile.food),
    'stat-food-flow': `+${formatFlow(stats.foodProduced)} / -${formatFlow(stats.foodConsumed)}${stats.foodShortfall > 0 ? ' ⚠️' : ''}`,
    'stat-goods-storage': `${Math.round(['food', 'consumerGoods', 'computerChips', 'arms', 'tanks'].reduce((sum, key) => sum + (stockpile[key] || 0), 0))} / ${Math.round(stats.resources?.capacity?.goods || 0)}`,
    'stat-coal': roundStock(stockpile.coal),
    'stat-iron': roundStock(stockpile.ironOre),
    'stat-bauxite': roundStock(stockpile.bauxiteOre),
    'stat-sand': roundStock(stockpile.sand),
    'stat-copper': roundStock(stockpile.copperOre),
    'stat-titanium': roundStock(stockpile.titaniumOre),
    'stat-iron-bar': roundStock(stockpile.ironBar),
    'stat-bauxite-bar': roundStock(stockpile.bauxiteBar),
    'stat-copper-bar': roundStock(stockpile.copperBar),
    'stat-steel': roundStock(stockpile.steel),
    'stat-glass': roundStock(stockpile.glass),
    'stat-polysilicon': roundStock(stockpile.polysilicon),
    'stat-computer-chips': roundStock(stockpile.computerChips),
    'stat-oil': roundStock(stockpile.oil),
    'stat-uranium': roundStock(stockpile.uraniumOre),
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

function formatBreakdown(values = {}) {
  return Object.entries(values).map(([name, value]) => `${name}: ${Math.round(value)}`).join(' | ') || 'None';
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
    const value = snapshot[key];
    if (key.endsWith('-visible')) {
      const target = documentRef.getElementById(key.replace('-visible', ''));
      if (target) target.style.display = value;
      wrote += 1;
      continue;
    } else if (key.endsWith('-fill')) {
      const el = documentRef.getElementById(key);
      if (!el) continue;
      const sep = value.indexOf('|');
      const width = sep >= 0 ? value.slice(0, sep) : value;
      const color = sep >= 0 ? value.slice(sep + 1) : '';
      if (el.style.width !== width) el.style.width = width;
      el.style.backgroundColor = color;
      wrote += 1;
    } else {
      const el = documentRef.getElementById(key);
      if (!el) continue;
      if (el.textContent !== value) {
      el.textContent = value;
      wrote += 1;
      }
    }
  }
  return wrote;
}

export function buildInspectorSignature(grid, tile, resources = null, treasury = 0) {
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
    } else if (producer.type === PRODUCER_TYPE.SILO) {
      producerCap = formatSiloStorage(producer, resources?.stockpile, resources?.capacity);
    } else if (producer.type === PRODUCER_TYPE.OIL_DERRICK) {
      producerCap = formatDerrickOutput(producer, resources?.stockpile, resources?.capacity);
    } else if (producer.type === PRODUCER_TYPE.HOSPITAL) {
      const staff = producer.filledJobs || 0;
      const capacity = staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB;
      producerCap = `patients:${capacity}:${staff}:${producer.patients || 0}`;
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
    producer?.tier || 1,
    producer?.prisoners || 0,
    producer?.patients || 0,
    producer?.maxStorage || 0,
    producer?.operational ? 1 : 0,
    producer?.contaminated ? 1 : 0,
    producer?.hasBatteryConnection ? 1 : 0,
    producerCap,
    connectionStatus?.message || '',
    tile.zone === ZONE.RESIDENTIAL ? 1 : 0,
    treasury,
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
