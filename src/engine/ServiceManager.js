import { SERVICE_TYPE, SERVICE_CONFIG, SERVICE_GLOBAL_CONFIG, LABOR_TAX_GROWTH_CONFIG, DENSITY, DEMOGRAPHICS_CONFIG } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';
import { CoverageManager } from './CoverageManager.js';

export class ServiceManager {
  static previousEmergencyCoverage = new WeakMap();

  static updateServices(grid, totalPopulation, employmentRate = 1.0, workforce = null) {
    const serviceKeys = [
      { type: SERVICE_TYPE.POLICE_STATION, key: 'police' },
      { type: SERVICE_TYPE.FIRE_STATION, key: 'fire' },
      { type: SERVICE_TYPE.HOSPITAL, key: 'hospital' },
      { type: SERVICE_TYPE.CLINIC, key: 'hospital' },
      { type: SERVICE_TYPE.SCHOOL, key: 'school' },
      { type: SERVICE_TYPE.LIBRARY, key: 'library' },
      { type: SERVICE_TYPE.CITY_HALL, key: 'cityHall' },
    ];
    const workerPool = workforce == null
      ? Math.round(Math.max(0, totalPopulation) * DEMOGRAPHICS_CONFIG.WORKFORCE_RATE)
      : workforce;
    let availableWorkers = Math.max(0, Math.floor(workerPool));
    let producerStateSignature = '';

    for (const { type } of serviceKeys) {
      const config = SERVICE_CONFIG[type];
      if (!config) continue;

      const producers = grid.producers.filter((p) => p.type === type);
      if (producers.length === 0) continue;

      producers.forEach((prod) => {
        if (!prod.operational) {
          prod.density = DENSITY.LIGHT;
        }

        // Determine building density/tier based on city population thresholds
        let density = DENSITY.LIGHT;
        if (totalPopulation >= config.popThresholds.high) {
          density = DENSITY.HIGH;
        } else if (totalPopulation >= config.popThresholds.medium) {
          density = DENSITY.MEDIUM;
        }
        prod.density = density;

        const budgetRatio = Math.max(0, Math.min(SERVICE_GLOBAL_CONFIG.BUDGET_MAX_VALUE, prod.budget ?? SERVICE_GLOBAL_CONFIG.BUDGET_MAX_VALUE)) / SERVICE_GLOBAL_CONFIG.BUDGET_MAX_VALUE;
        const maxJobs = config.jobs[density] || SERVICE_GLOBAL_CONFIG.MIN_STAFFING_BASELINE;
        const effectivePop = config.maxPopulationServed ? Math.min(totalPopulation, config.maxPopulationServed) : totalPopulation;
        const populationOfficers = Math.max(SERVICE_GLOBAL_CONFIG.MIN_STAFFING_BASELINE, Math.ceil(effectivePop / (config.officersPerPopulation || Infinity)));
        const populationStaffedTypes = [
          SERVICE_TYPE.POLICE_STATION,
          SERVICE_TYPE.FIRE_STATION,
          SERVICE_TYPE.HOSPITAL,
          SERVICE_TYPE.CLINIC,
        ];
        const staffedBase = populationStaffedTypes.includes(type)
          ? Math.min(maxJobs, populationOfficers)
          : maxJobs;
        const budgetedJobs = Math.round(staffedBase * budgetRatio);
        prod.totalJobs = budgetedJobs;

        if (!prod.operational) {
          prod.filledJobs = 0;
          prod.effectiveRadius = 0;
          prod.runningCost = 0;
          producerStateSignature += `${prod.id}:${prod.x},${prod.y}:0:0:0:${prod.budget};`;
          return;
        }

        // Fully funded essential services receive workers before commercial and industrial jobs.
        prod.filledJobs = Math.min(budgetedJobs, availableWorkers);
        availableWorkers -= prod.filledJobs;
        const maxRadius = config.radius[density] || SERVICE_GLOBAL_CONFIG.DEFAULT_SERVICE_RADIUS;
        // Emergency coverage is calculated by CoverageManager from staffed jobs.
        prod.effectiveRadius = maxRadius;
        const baseCost = config.runningCost?.[density] || 0;
        const utilityDemand = Object.values(config.utilityUsage || {}).reduce((sum, amount) => sum + amount, 0);
        const demandFactor = 1 + utilityDemand * SERVICE_GLOBAL_CONFIG.UTILITY_DEMAND_COST_MULTIPLIER;
        const staffingFactor = populationStaffedTypes.includes(type) && maxJobs > 0
          ? prod.totalJobs / maxJobs
          : 1;
        prod.runningCost = config.runningCostPerJob
          ? Math.ceil(prod.filledJobs * config.runningCostPerJob * demandFactor * budgetRatio)
          : Math.ceil(baseCost * staffingFactor * demandFactor * budgetRatio);

        producerStateSignature += `${prod.id}:${prod.x},${prod.y}:1:${prod.filledJobs}:${prod.effectiveRadius}:${prod.budget};`;
      });
    }

    const cached = this.previousEmergencyCoverage.get(grid);
    const coverageManagerDirty = Boolean(
      CoverageManager.dirtyFlags.fire ||
      CoverageManager.dirtyFlags.police ||
      CoverageManager.dirtyFlags.medical
    );
    const needsCoverageUpdate = !cached ||
      coverageManagerDirty ||
      cached.coverageVersion !== grid.coverageVersion ||
      cached.activeZonedTilesCount !== grid.activeZonedTiles.size ||
      cached.producerStateSignature !== producerStateSignature;

    if (!needsCoverageUpdate) {
      return;
    }

    // Reset services on all active zoned tiles
    for (const tile of grid.getActiveZonedTiles()) {
      tile.serviceDistances = {
        police: Infinity,
        fire: Infinity,
        hospital: Infinity,
        school: Infinity,
        library: Infinity,
        cityHall: Infinity,
      };
      tile.services = {
        police: false,
        fire: false,
        hospital: false,
        school: false,
        library: false,
        cityHall: false,
      };
    }

    // Clear previously covered tiles that might not be zoned tiles
    if (cached?.coveredTiles) {
      for (const [coverageKey, serviceKey] of [['police', 'police'], ['fire', 'fire'], ['medical', 'hospital']]) {
        for (const tile of cached.coveredTiles[coverageKey] || []) {
          if (tile.services) tile.services[serviceKey] = false;
          if (tile.serviceDistances) tile.serviceDistances[serviceKey] = Infinity;
        }
      }
    }

    // Compute road network distances for school, library, and City Hall
    for (const { type, key } of serviceKeys) {
      if (key === 'police' || key === 'fire' || key === 'hospital') continue;
      const producers = grid.producers.filter((p) => p.type === type && p.operational);
      if (producers.length === 0) continue;

      const { roadDistancesMap } = RoadNetwork.computeProducerDistances(grid, type);

      for (const tile of grid.getActiveZonedTiles()) {
        const roadKey = `${tile.x},${tile.y}`;
        let minDist = Infinity;

        // Check tile itself if it's a road
        if (roadDistancesMap.has(roadKey)) {
          for (const [pId, info] of roadDistancesMap.get(roadKey)) {
            if (info.distance <= info.producer.effectiveRadius && info.distance < minDist) {
              minDist = info.distance;
            }
          }
        }

        // Check adjacent roads if tile is not a road
        const neighbors = grid.getNeighbors(tile.x, tile.y);
        for (const n of neighbors) {
          const nKey = `${n.x},${n.y}`;
          if (roadDistancesMap.has(nKey)) {
            for (const [pId, info] of roadDistancesMap.get(nKey)) {
              const distToTile = info.distance + 1;
              if (info.distance <= info.producer.effectiveRadius && distToTile < minDist) {
                minDist = distToTile;
              }
            }
          }
        }

        if (minDist < Infinity) {
          tile.serviceDistances[key] = Math.min(tile.serviceDistances[key] ?? Infinity, minDist);
          tile.services[key] = true;
        }
      }
    }

    CoverageManager.updateAll(grid);
    const newCoveredTiles = { police: [], fire: [], medical: [] };
    for (const [coverageKey, serviceKey] of [['police', 'police'], ['fire', 'fire'], ['medical', 'hospital']]) {
      const coverage = CoverageManager.getCoverageSet(grid, coverageKey);
      for (const location of coverage) {
        const comma = location.indexOf(',');
        const x = Number(location.slice(0, comma));
        const y = Number(location.slice(comma + 1));
        const tile = grid.getTile(x, y);
        if (!tile) continue;
        newCoveredTiles[coverageKey].push(tile);
        if (!tile.serviceDistances) tile.serviceDistances = {
          police: Infinity,
          fire: Infinity,
          hospital: Infinity,
          school: Infinity,
          library: Infinity,
          cityHall: Infinity,
        };
        if (!tile.services) tile.services = {
          police: false,
          fire: false,
          hospital: false,
          school: false,
          library: false,
          cityHall: false,
        };
        tile.serviceDistances[serviceKey] = 0;
        tile.services[serviceKey] = true;
      }
    }

    this.previousEmergencyCoverage.set(grid, {
      coverageVersion: grid.coverageVersion,
      activeZonedTilesCount: grid.activeZonedTiles.size,
      producerStateSignature,
      coveredTiles: newCoveredTiles,
    });
  }
}
