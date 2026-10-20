import { cellToBoundary, cellToChildren, cellToLatLng, getRes0Cells, gridDisk, latLngToCell } from 'h3-js';
import { BIOME_TYPES, CLIMATE_CONFIG, COAST_DIRECTIONS } from '../config.js';
import { createPRNG } from './Grid.js';

export const OVERWORLD_RESOLUTION = 2;

function hashSeed(seed, id) {
  let hash = (Number(seed) || 1) >>> 0;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return 100000 + hash % 9000000;
}

const BIOME_CLIMATE = {
  [BIOME_TYPES.PLAINS]: { temperature: 0, moisture: 0.5 },
  [BIOME_TYPES.TEMPERATE]: { temperature: -1, moisture: 0.58 },
  [BIOME_TYPES.HILLY]: { temperature: -4, moisture: 0.46 },
  [BIOME_TYPES.MOUNTAINOUS]: { temperature: -8, moisture: 0.52 },
  [BIOME_TYPES.SWAMP]: { temperature: 1, moisture: 0.82 },
  [BIOME_TYPES.DESERT]: { temperature: 5, moisture: 0.1 },
  [BIOME_TYPES.TUNDRA]: { temperature: -8, moisture: 0.25 },
  // Arctic ice sheets are the coldest and windiest surface on the planet. The explicit
  // weather mix keeps the sky almost permanently overcast, and the high wind mean with a
  // gale chance produces the occasional top-of-scale blow.
  [BIOME_TYPES.ARCTIC]: {
    temperature: -14,
    moisture: 0.92,
    weather: { sunny: 0.02, cloudy: 0.63, rainy: 0.35 },
    windMean: 0.8,
    galeChance: 0.25,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Compass bearing in degrees, clockwise from north, between two hex centres.
function bearingDegrees(fromLat, fromLng, toLat, toLng) {
  const dLng = ((toLng - fromLng + 540) % 360) - 180;
  const midLatRad = ((fromLat + toLat) / 2) * (Math.PI / 180);
  const east = dLng * Math.cos(midLatRad);
  const north = toLat - fromLat;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

// Snap a bearing to the nearest of the six hex edge directions.
function coastSectorForBearing(bearing) {
  const sectorSize = 360 / COAST_DIRECTIONS.length;
  const index = Math.round(bearing / sectorSize) % COAST_DIRECTIONS.length;
  return COAST_DIRECTIONS[index];
}

// Polar land outside the permanent cap is tundra no matter which continent region reaches it.
export function isPolarLatitude(lat) {
  return Math.abs(lat) >= CLIMATE_CONFIG.POLAR_CAP_LATITUDE;
}

// Poleward of this latitude the surface is permanent Arctic ice, land or ocean alike. This
// is the nominal cap latitude; the actual edge wobbles (see createArcticCapBoundary).
export function isArcticCapLatitude(lat) {
  return Math.abs(lat) >= CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE;
}

// The polar caps are climate bands, but their edge is drawn with a seeded wobble so the
// Arctic ice reads as a natural coastline rather than a perfect circle. Three low-order
// waves in longitude and latitude give a smooth, seam-free boundary shared by neighbors.
export function createArcticCapBoundary(seed) {
  // Keep the original hash key so existing planet seeds draw the same coastline.
  const random = createPRNG(hashSeed(seed, 'ice-cap-phases'));
  const phases = Array.from({ length: 5 }, () => random() * Math.PI * 2);
  return (lat, lng) => {
    const longitude = lng * Math.PI / 180;
    const latitude = lat * Math.PI / 180;
    const wobble = 0.5 * Math.sin(3 * longitude + phases[0]) * Math.cos(2 * latitude + phases[1]) +
      0.3 * Math.sin(5 * longitude + phases[2]) * Math.cos(3 * latitude + phases[3]) +
      0.2 * Math.sin(7 * longitude + phases[4]);
    return Math.abs(lat) >= CLIMATE_CONFIG.ARCTIC_CAP_LATITUDE - wobble * CLIMATE_CONFIG.ARCTIC_CAP_WOBBLE;
  };
}

// Biome weather mixes vary slightly from hex to hex, so a whole Arctic sheet does not share
// one identical forecast. The jitter only reallocates cloud and rain; the mix stays normalized.
function jitterWeatherChances(weather, random) {
  const jitter = CLIMATE_CONFIG.BIOME_WEATHER_JITTER;
  const sunny = clamp(weather.sunny * (1 + (random() - 0.5) * 2 * jitter), 0.002, 0.12);
  const cloudy = clamp(weather.cloudy * (1 + (random() - 0.5) * 2 * jitter), 0.2, 0.9);
  const rainy = clamp(1 - sunny - cloudy, 0.05, 0.9);
  const total = sunny + cloudy + rainy;
  return { sunny: sunny / total, cloudy: cloudy / total, rainy: rainy / total };
}

function baseClimate(cell) {
  const latitude = clamp(Math.abs(cell.lat) / 90, 0, 1);
  const biome = BIOME_CLIMATE[cell.biome] || BIOME_CLIMATE[BIOME_TYPES.PLAINS];
  const temperature = CLIMATE_CONFIG.EQUATOR_TEMP +
    (CLIMATE_CONFIG.POLE_TEMP - CLIMATE_CONFIG.EQUATOR_TEMP) *
      Math.pow(latitude, CLIMATE_CONFIG.LATITUDE_GRADIENT_POWER) + biome.temperature;
  const moisture = cell.ocean ? 0.86 : biome.moisture + (1 - latitude) * 0.08;
  return {
    temperature,
    moisture,
    weather: biome.weather,
    windMean: biome.windMean ?? CLIMATE_CONFIG.WIND_DEFAULT_MEAN,
    galeChance: biome.galeChance ?? 0,
  };
}

export function buildClimateProfile(worldSeed, cell, neighbors = []) {
  const random = createPRNG(hashSeed(worldSeed, `${cell.id}:climate`));
  const local = baseClimate(cell);
  const neighborClimate = neighbors.filter(Boolean).map(baseClimate);
  const neighborTemperature = neighborClimate.length
    ? neighborClimate.reduce((sum, climate) => sum + climate.temperature, 0) / neighborClimate.length
    : local.temperature;
  const neighborMoisture = neighborClimate.length
    ? neighborClimate.reduce((sum, climate) => sum + climate.moisture, 0) / neighborClimate.length
    : local.moisture;
  const neighborWind = neighborClimate.length
    ? neighborClimate.reduce((sum, climate) => sum + climate.windMean, 0) / neighborClimate.length
    : local.windMean;
  const temperatureMean = clamp(
    local.temperature + (neighborTemperature - local.temperature) * CLIMATE_CONFIG.TEMP_NEIGHBOR_INFLUENCE +
      (random() - 0.5) * 2 * CLIMATE_CONFIG.TEMP_SEED_VARIATION,
    CLIMATE_CONFIG.TEMP_MIN,
    CLIMATE_CONFIG.TEMP_MAX
  );
  const moisture = clamp(
    local.moisture + (neighborMoisture - local.moisture) * CLIMATE_CONFIG.MOISTURE_NEIGHBOR_INFLUENCE +
      (random() - 0.5) * 0.12,
    0,
    1
  );
  const windMean = clamp(
    local.windMean + (neighborWind - local.windMean) * CLIMATE_CONFIG.TEMP_NEIGHBOR_INFLUENCE +
      (random() - 0.5) * CLIMATE_CONFIG.BIOME_WIND_JITTER,
    0,
    1
  );
  const rainy = clamp(0.04 + moisture * 0.48, 0.04, 0.52);
  const cloudy = clamp(0.18 + moisture * 0.18, 0.18, 0.36);
  const temperatureStdDev = CLIMATE_CONFIG.TEMP_STDDEV_MIN +
    random() * (CLIMATE_CONFIG.TEMP_STDDEV_MAX - CLIMATE_CONFIG.TEMP_STDDEV_MIN);

  return {
    temperatureMean,
    temperatureStdDev,
    temperatureMin: Math.max(CLIMATE_CONFIG.TEMP_MIN, temperatureMean - temperatureStdDev * 2.5),
    temperatureMax: Math.min(CLIMATE_CONFIG.TEMP_MAX, temperatureMean + temperatureStdDev * 2.5),
    weatherChances: local.weather
      ? jitterWeatherChances(local.weather, random)
      : { sunny: 1 - rainy - cloudy, cloudy, rainy },
    windMean,
    galeChance: local.galeChance
      ? clamp(local.galeChance + (random() - 0.5) * CLIMATE_CONFIG.BIOME_GALE_JITTER, 0, 1)
      : 0,
  };
}

function longitudeOffset(lng, center) {
  return ((lng - center + 540) % 360) - 180;
}

function createContinents(random) {
  const continents = [];
  for (let index = 0; index < 6; index++) {
    let lat, lng;
    for (let attempt = 0; attempt < 80; attempt++) {
      lat = (random() - 0.5) * 110;
      lng = (random() - 0.5) * 360;
      if (continents.every((other) => Math.hypot(lat - other.lat,
        longitudeOffset(lng, other.lng) * Math.cos((lat + other.lat) * Math.PI / 360)) > 50)) break;
    }
    continents.push({
      lat, lng,
      latRadius: 20 + random() * 13,
      lonRadius: 24 + random() * 18,
      phase: random() * Math.PI * 2,
      ridgeAngle: random() * Math.PI * 2,
      wetX: (random() - 0.5) * 0.8,
      wetY: (random() - 0.5) * 0.7,
    });
  }
  return continents;
}

function regionAt(lat, lng, continents) {
  for (const continent of continents) {
    const x = longitudeOffset(lng, continent.lng) * Math.cos(continent.lat * Math.PI / 180) / continent.lonRadius;
    const y = (lat - continent.lat) / continent.latRadius;
    const angle = Math.atan2(y, x);
    const coast = 1 + 0.22 * Math.sin(3 * angle + continent.phase) +
      0.14 * Math.cos(5 * angle - continent.phase) + 0.06 * Math.sin(8 * angle + continent.phase);
    if (Math.hypot(x, y) > coast) continue;
    const ridge = Math.abs(x * Math.cos(continent.ridgeAngle) + y * Math.sin(continent.ridgeAngle) - 0.32);
    if (ridge < 0.16 && Math.hypot(x, y) < 0.85) return BIOME_TYPES.MOUNTAINOUS;
    if (Math.abs(lat) < 40 && Math.hypot(x - continent.wetX, y - continent.wetY) < 0.4) return BIOME_TYPES.SWAMP;
    if (Math.abs(lat) < 50 && Math.hypot(x + continent.wetX + 0.45, y + continent.wetY) < 0.5) return BIOME_TYPES.DESERT;
    const lowlandRegion = x * Math.cos(continent.phase) + y * Math.sin(continent.phase);
    if (Math.abs(lat) > 20 && Math.abs(lat) <= 49 && Math.hypot(x, y) <= 0.8 && lowlandRegion < 0) return BIOME_TYPES.TEMPERATE;
    return Math.abs(lat) > 49 || Math.hypot(x, y) > 0.8 ? BIOME_TYPES.HILLY : BIOME_TYPES.PLAINS;
  }
  return null;
}

export class OverworldMap {
  constructor(seed, homeSeed) {
    this.seed = Number(seed) || 1;
    const random = createPRNG(hashSeed(this.seed, 'landmasses'));
    const continents = createContinents(random);
    this.arcticCapBoundary = createArcticCapBoundary(this.seed);
    this.homeCellId = latLngToCell(continents[0].lat, continents[0].lng, OVERWORLD_RESOLUTION);
    const islands = new Set();
    for (let chain = 0; chain < 8; chain++) {
      const lat = (random() - 0.5) * 120;
      const lng = (random() - 0.5) * 360;
      for (let index = 0; index < 2 + Math.floor(random() * 3); index++) {
        islands.add(latLngToCell(lat + index * 3 + (random() - 0.5) * 4,
          lng + index * 4 + (random() - 0.5) * 5, OVERWORLD_RESOLUTION));
      }
    }
    this.cells = new Map();
    for (const parent of getRes0Cells()) {
      for (const id of cellToChildren(parent, OVERWORLD_RESOLUTION)) {
        const [lat, lng] = cellToLatLng(id);
        const biome = regionAt(lat, lng, continents);
        // The permanent Arctic cap freezes open ocean as well as any land that reaches it,
        // so ice hexes are ordinary buildable ground even where no continent was generated.
        const arcticCap = this.arcticCapBoundary(lat, lng);
        const cell = {
          id,
          lat,
          lng,
          boundary: cellToBoundary(id),
          ocean: !arcticCap && !biome && !islands.has(id) && id !== this.homeCellId,
        };
        if (!cell.ocean) {
          cell.seed = id === this.homeCellId && homeSeed != null ? Number(homeSeed) : hashSeed(this.seed, id);
          cell.biome = arcticCap
            ? BIOME_TYPES.ARCTIC
            : isPolarLatitude(lat)
              ? BIOME_TYPES.TUNDRA
              : biome || (Math.abs(lat) > 45 ? BIOME_TYPES.HILLY : BIOME_TYPES.PLAINS);
        }
        this.cells.set(id, cell);
      }
    }
    this.refreshClimateProfiles();
  }

  refreshClimateProfiles() {
    for (const cell of this.cells.values()) {
      if (cell.ocean) continue;
      const neighbors = gridDisk(cell.id, 1)
        .filter((id) => id !== cell.id)
        .map((id) => this.cells.get(id));
      cell.climate = buildClimateProfile(this.seed, cell, neighbors);
    }
  }

  getCell(id) {
    return this.cells.get(id) || null;
  }

  // Which of the hex's six edges face open ocean, in the canonical clockwise order
  // N, NE, SE, S, SW, NW. The city map paints salt water on the matching side, so a hex
  // with one ocean neighbour gets one band and an island hex gets six.
  getOceanFacingDirections(id) {
    const cell = this.cells.get(id);
    if (!cell || cell.ocean) return [];
    if (!this.coastCache) this.coastCache = new Map();
    const cached = this.coastCache.get(id);
    if (cached) return cached;

    const [lat, lng] = cellToLatLng(id);
    const sectors = new Set();
    for (const neighborId of gridDisk(id, 1)) {
      if (neighborId === id) continue;
      const neighbor = this.cells.get(neighborId);
      if (neighbor && !neighbor.ocean) continue;
      const [neighborLat, neighborLng] = cellToLatLng(neighborId);
      sectors.add(coastSectorForBearing(bearingDegrees(lat, lng, neighborLat, neighborLng)));
    }
    const directions = COAST_DIRECTIONS.filter((direction) => sectors.has(direction));
    this.coastCache.set(id, directions);
    return directions;
  }

  setHomeSeed(seed) {
    this.cells.get(this.homeCellId).seed = Number(seed);
  }
}