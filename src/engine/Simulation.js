import { GROWTH_CONFIG, DENSITY, ZONE, TERRAIN, USAGE_RATES, BASE_INCOME, POLLUTION_CONFIG, JOBS_PROVIDED, EMPLOYABLE_POPULATION, RESIDENTIAL_CAPACITY, LABOR_TAX_GROWTH_CONFIG, FOREST_DESIRABILITY_RADIUS } from '../config.js';
import { UtilityManager } from './UtilityManager.js';
import { PollutionManager } from './PollutionManager.js';

export class Simulation {
  constructor(grid) {
    this.grid = grid;
    this.tickCount = 0;
    this.isPaused = false;
    this.speed = 1;
    this.taxRate = 100;
    this.stats = {
      population: 0,
      incomePerTick: 0,
      powerDemand: 0,
      powerCapacity: 0,
      waterDemand: 0,
      waterCapacity: 0,
      sewageDemand: 0,
      sewageCapacity: 0,
      avgPollution: 0,
      maxPollution: 0,
      totalJobsProvided: 0,
      totalEmployablePopulation: 0,
      jobsFilled: 0,
      jobsAvailable: 0,
      employmentRate: 0,
      zones: {
        residential: { light: 0, medium: 0, high: 0 },
        commercial: { light: 0, medium: 0, high: 0 },
        industrial: { light: 0, medium: 0, high: 0 },
      },
    };
  }

  tick() {
    this.tickCount++;

    UtilityManager.allocateAll(this.grid);
    PollutionManager.computePollution(this.grid);

    this.computeStats();
    this.updateGrowthAndDensity();

    return this.stats.incomePerTick;
  }

  updateGrowthAndDensity() {
    const jobsAvail = this.stats.jobsAvailable;
    const empRate = this.stats.employmentRate;

    let taxPenalty = 0;
    if (this.taxRate > LABOR_TAX_GROWTH_CONFIG.BASE_NEUTRAL_TAX_RATE) {
      taxPenalty = Math.floor(
        (this.taxRate - LABOR_TAX_GROWTH_CONFIG.BASE_NEUTRAL_TAX_RATE) / 50
      ) * LABOR_TAX_GROWTH_CONFIG.TAX_PENALTY_PER_50_PCT;
    }

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);
        if (!tile || tile.zone === ZONE.NONE) continue;

        const isFullyServiced =
          !tile.shortfall.power &&
          !tile.shortfall.water &&
          !tile.shortfall.sewage;

        let delta = 0;
        if (isFullyServiced) {
          delta += GROWTH_CONFIG.SERVICED_DELTA;
        } else {
          delta += GROWTH_CONFIG.SHORTFALL_DELTA;
        }

        if (
          tile.pollution >= POLLUTION_CONFIG.POLLUTION_GROWTH_PENALTY_THRESHOLD &&
          tile.zone !== ZONE.INDUSTRIAL
        ) {
          delta += POLLUTION_CONFIG.POLLUTION_GROWTH_PENALTY;
        }

        // Apply tax rate penalty across ALL zone types (R, C, I)
        delta -= taxPenalty;

        if (tile.zone === ZONE.RESIDENTIAL) {
          // Forest desirability bonus
          if (this.hasNearbyForest(x, y)) {
            delta += 1;
          }
          // Residential growthScore only increases if jobsAvailable > 0.
          // No available jobs = positive growth stalls entirely.
          if (jobsAvail <= 0 && delta > 0) {
            delta = 0;
          }
        } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
          // Commercial & Industrial development rate depends on how many jobs are filled (empRate)
          let empBonus = 0;
          if (empRate >= 0.75) {
            empBonus = LABOR_TAX_GROWTH_CONFIG.EMPLOYMENT_BONUS_MAX; // Strong worker supply boosts development
          } else if (empRate < 0.25) {
            empBonus = -1; // Worker shortage slows/stalls development
          }
          delta += empBonus;
        }

        tile.growthScore = Math.max(0, tile.growthScore + delta);

        if (tile.growthScore >= GROWTH_CONFIG.THRESHOLD_HIGH) {
          tile.density = DENSITY.HIGH;
        } else if (tile.growthScore >= GROWTH_CONFIG.THRESHOLD_MEDIUM) {
          tile.density = DENSITY.MEDIUM;
        } else {
          tile.density = DENSITY.LIGHT;
        }
      }
    }
  }

  computeStats() {
    const stats = {
      population: 0,
      incomePerTick: 0,
      powerDemand: 0,
      powerCapacity: 0,
      waterDemand: 0,
      waterCapacity: 0,
      sewageDemand: 0,
      sewageCapacity: 0,
      avgPollution: 0,
      maxPollution: 0,
      totalJobsProvided: 0,
      totalEmployablePopulation: 0,
      jobsFilled: 0,
      jobsAvailable: 0,
      employmentRate: 0,
      zones: {
        residential: { light: 0, medium: 0, high: 0 },
        commercial: { light: 0, medium: 0, high: 0 },
        industrial: { light: 0, medium: 0, high: 0 },
      },
    };

    for (const p of this.grid.producers) {
      if (!this.grid.isRoadAdjacent(p.x, p.y)) continue;
      if (p.type === 'power_plant') stats.powerCapacity += p.capacity;
      if (p.type === 'water_tower') stats.waterCapacity += p.capacity;
      if (p.type === 'sewage_plant') stats.sewageCapacity += p.capacity;
    }

    let baseIncomeSum = 0;
    let totalPollution = 0;
    let tileCount = 0;

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);

        if (tile.pollution > stats.maxPollution) {
          stats.maxPollution = tile.pollution;
        }
        totalPollution += tile.pollution;
        tileCount++;

        if (!tile || tile.zone === ZONE.NONE) continue;

        const rates = USAGE_RATES[tile.zone]?.[tile.density] || { power: 0, water: 0, sewage: 0 };
        stats.powerDemand += rates.power;
        stats.waterDemand += rates.water;
        stats.sewageDemand += rates.sewage;

        const tileBaseIncome = BASE_INCOME[tile.zone]?.[tile.density] || 0;
        baseIncomeSum += tileBaseIncome;

        if (stats.zones[tile.zone]) {
          stats.zones[tile.zone][tile.density]++;
        }

        if (tile.zone === ZONE.RESIDENTIAL) {
          const cap = RESIDENTIAL_CAPACITY[tile.density] || 0;
          const pop = this.computeTilePopulation(tile, cap);
          tile.population = pop;
          tile.maxPopulation = cap;
          stats.population += pop;
          stats.totalEmployablePopulation += pop;
        } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
          const jobs = JOBS_PROVIDED[tile.zone]?.[tile.density] || 0;
          tile.totalJobs = jobs;
          stats.totalJobsProvided += jobs;
        } else {
          tile.population = 0;
          tile.maxPopulation = 0;
          tile.totalJobs = 0;
          tile.filledJobs = 0;
        }
      }
    }

    stats.jobsFilled = Math.min(stats.totalJobsProvided, stats.totalEmployablePopulation);
    stats.jobsAvailable = Math.max(0, stats.totalJobsProvided - stats.totalEmployablePopulation);
    stats.employmentRate = stats.totalJobsProvided > 0 ? (stats.jobsFilled / stats.totalJobsProvided) : 0;

    // Distribute filled jobs across C/I tiles proportionally
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);
        if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
          tile.filledJobs = Math.round((tile.totalJobs || 0) * stats.employmentRate);
        }
      }
    }

    stats.incomePerTick = Math.round(baseIncomeSum * (this.taxRate / 100));
    stats.avgPollution = tileCount > 0 ? Math.round((totalPollution / tileCount) * 10) / 10 : 0;
    this.stats = stats;
  }

  computeTilePopulation(tile, capacity) {
    const gs = tile.growthScore;
    const tMed = GROWTH_CONFIG.THRESHOLD_MEDIUM;
    const tHigh = GROWTH_CONFIG.THRESHOLD_HIGH;
    let progress;

    if (tile.density === DENSITY.LIGHT) {
      progress = tMed > 0 ? Math.min(1, gs / tMed) : 1;
    } else if (tile.density === DENSITY.MEDIUM) {
      progress = (tHigh - tMed) > 0 ? Math.min(1, (gs - tMed) / (tHigh - tMed)) : 1;
    } else {
      progress = tHigh > 0 ? Math.min(1, (gs - tHigh) / tHigh) : 1;
    }
    return Math.max(1, Math.round(capacity * (0.1 + 0.9 * Math.max(0, progress))));
  }

  hasNearbyForest(cx, cy) {
    const r = FOREST_DESIRABILITY_RADIUS;
    const minY = Math.max(0, cy - r);
    const maxY = Math.min(this.grid.height - 1, cy + r);
    const minX = Math.max(0, cx - r);
    const maxX = Math.min(this.grid.width - 1, cx + r);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= r) {
          if (this.grid.tiles[y][x].terrain === TERRAIN.FOREST) return true;
        }
      }
    }
    return false;
  }
}
