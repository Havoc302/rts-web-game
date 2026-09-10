import { SERVICE_TYPE, SERVICE_CONFIG, SERVICE_GLOBAL_CONFIG, LABOR_TAX_GROWTH_CONFIG, DENSITY } from '../config.js';
import { RoadNetwork } from './RoadNetwork.js';

export class ServiceManager {
  static updateServices(grid, totalPopulation, employmentRate = 1.0) {
    // 1. Reset tile service distances
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.tiles[y][x];
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
    }

    const serviceKeys = [
      { type: SERVICE_TYPE.POLICE_STATION, key: 'police' },
      { type: SERVICE_TYPE.FIRE_STATION, key: 'fire' },
      { type: SERVICE_TYPE.HOSPITAL, key: 'hospital' },
      { type: SERVICE_TYPE.SCHOOL, key: 'school' },
      { type: SERVICE_TYPE.LIBRARY, key: 'library' },
      { type: SERVICE_TYPE.CITY_HALL, key: 'cityHall' },
    ];

    for (const { type, key } of serviceKeys) {
      const config = SERVICE_CONFIG[type];
      if (!config) continue;

      const producers = grid.producers.filter((p) => p.type === type);
      if (producers.length === 0) continue;

      producers.forEach((prod) => {
        if (!prod.operational) {
          prod.density = DENSITY.LIGHT;
          prod.totalJobs = 0;
          prod.filledJobs = 0;
          prod.effectiveRadius = 0;
          prod.runningCost = 0;
          return;
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
        const populationOfficers = Math.max(SERVICE_GLOBAL_CONFIG.MIN_STAFFING_BASELINE, Math.ceil(totalPopulation / (config.officersPerPopulation || Infinity)));
        const populationStaffedTypes = [
          SERVICE_TYPE.POLICE_STATION,
          SERVICE_TYPE.FIRE_STATION,
          SERVICE_TYPE.HOSPITAL,
        ];
        const staffedBase = populationStaffedTypes.includes(type)
          ? Math.min(maxJobs, populationOfficers)
          : maxJobs;
        const budgetedJobs = Math.round(staffedBase * budgetRatio);
        prod.totalJobs = budgetedJobs;
        // Jobs filled scale with city employment rate (min 30% baseline staff)
        prod.filledJobs = Math.min(budgetedJobs, Math.round(budgetedJobs * Math.max(LABOR_TAX_GROWTH_CONFIG.MIN_SERVICE_EMPLOYMENT_RATE, employmentRate)));

        const fillRatio = prod.totalJobs > 0 ? prod.filledJobs / prod.totalJobs : 0;
        const maxRadius = populationStaffedTypes.includes(type)
          ? Math.min(config.radius[density] || 0, prod.filledJobs)
          : config.radius[density] || SERVICE_GLOBAL_CONFIG.DEFAULT_SERVICE_RADIUS;
        // Coverage range scales with filled jobs
        prod.effectiveRadius = budgetRatio > 0
          ? Math.max(SERVICE_GLOBAL_CONFIG.MIN_EFFECTIVE_SERVICE_RADIUS, Math.round(maxRadius * budgetRatio * (SERVICE_GLOBAL_CONFIG.COVERAGE_MIN_FACTOR + SERVICE_GLOBAL_CONFIG.COVERAGE_MAX_FACTOR * fillRatio)))
          : 0;
        const baseCost = config.runningCost?.[density] || 0;
        const utilityDemand = Object.values(config.utilityUsage || {}).reduce((sum, amount) => sum + amount, 0);
        const demandFactor = 1 + utilityDemand * SERVICE_GLOBAL_CONFIG.UTILITY_DEMAND_COST_MULTIPLIER;
        const staffingFactor = populationStaffedTypes.includes(type) && maxJobs > 0
          ? prod.totalJobs / maxJobs
          : 1;
        prod.runningCost = config.runningCostPerJob
          ? Math.ceil(prod.filledJobs * config.runningCostPerJob * demandFactor * budgetRatio)
          : Math.ceil(baseCost * staffingFactor * demandFactor * budgetRatio);
      });

      // Compute road network distances
      const { roadDistancesMap } = RoadNetwork.computeProducerDistances(grid, type);

      // Apply road distances to tiles
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const tile = grid.tiles[y][x];
          const roadKey = `${x},${y}`;

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
          const neighbors = grid.getNeighbors(x, y);
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
            tile.serviceDistances[key] = minDist;
            tile.services[key] = true;
          }
        }
      }
    }
  }
}
