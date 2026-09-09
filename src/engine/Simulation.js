import { GROWTH_CONFIG, DENSITY, ZONE, TERRAIN, USAGE_RATES, POLLUTION_CONFIG, JOBS_PROVIDED, EMPLOYABLE_POPULATION, RESIDENTIAL_CAPACITY, LABOR_TAX_GROWTH_CONFIG, FOREST_DESIRABILITY_RADIUS, PRODUCER_TYPE, POWER_PRODUCER_TYPES, ROAD_MAINTENANCE_COST, TAX_REVENUE_CONFIG, CRIME_CONFIG, TICKS_PER_HOUR, HOURS_PER_DAY, DAY_START_HOUR, NIGHT_START_HOUR } from '../config.js';
import { UtilityManager } from './UtilityManager.js';
import { PollutionManager } from './PollutionManager.js';
import { ServiceManager } from './ServiceManager.js';
import { CrimeManager } from './CrimeManager.js';

export class Simulation {
  constructor(grid) {
    this.grid = grid;
    this.tickCount = 0;
    this.isPaused = false;
    this.speed = 1;
    this.taxRate = 0;
    this.stats = {
      population: 0,
      incomePerTick: 0,
      powerDemand: 0,
      powerCapacity: 0,
      waterDemand: 0,
      waterCapacity: 0,
      sewageDemand: 0,
      sewageCapacity: 0,
      serviceExpenses: 0,
      roadExpenses: 0,
      avgPollution: 0,
      maxPollution: 0,
      totalJobsProvided: 0,
      totalEmployablePopulation: 0,
      jobsFilled: 0,
      jobsAvailable: 0,
      employmentRate: 0,
      crimeTaxLoss: 0,
      zones: {
        residential: { light: 0, medium: 0, high: 0 },
        commercial: { light: 0, medium: 0, high: 0 },
        industrial: { light: 0, medium: 0, high: 0 },
      },
    };
  }

  tick(advanceWorld = true) {
    if (advanceWorld) {
      this.tickCount++;
    }

    UtilityManager.allocateAll(this.grid, this.getHourOfDay());
    PollutionManager.computePollution(this.grid);
    ServiceManager.updateServices(this.grid, this.stats.population, this.stats.employmentRate);
    if (advanceWorld) {
      CrimeManager.updateCrime(this.grid, this.stats);
      this.updateSurveys();
    }

    this.computeStats();
    if (advanceWorld) {
      this.updateGrowthAndDensity();
    }

    return this.stats.incomePerTick;
  }

  updateSurveys() {
    for (const surveyor of this.grid.producers) {
      if (surveyor.type !== PRODUCER_TYPE.SURVEY_STATION || !surveyor.surveyTarget) continue;
      const target = this.grid.getTile(surveyor.surveyTarget.x, surveyor.surveyTarget.y);
      if (!target || !surveyor.operational || target.surveyingBy !== surveyor.id) continue;

      surveyor.surveyProgress++;
      target.surveyProgress = surveyor.surveyProgress;
      if (surveyor.surveyProgress < surveyor.surveyRequired) continue;

      target.oreDiscovered = true;
      target.discoveredOre = target.ore;
      target.surveyingBy = null;
      target.surveyProgress = surveyor.surveyRequired;
      surveyor.surveyTarget = null;
      surveyor.surveyProgress = 0;
      surveyor.surveyRequired = 0;
    }
  }

  getHourOfDay() {
    return Math.floor(this.tickCount / TICKS_PER_HOUR) % HOURS_PER_DAY;
  }

  isDaytime() {
    const hour = this.getHourOfDay();
    return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR;
  }

  updateGrowthAndDensity() {
    const jobsAvail = this.stats.jobsAvailable;
    const empRate = this.stats.employmentRate;

    const taxGrowthModifier = this.getTaxGrowthModifier();

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

        if ((tile.crime || 0) >= CRIME_CONFIG.CRIME_PENALTY_THRESHOLD) {
          delta += -2;
        }

        // Tax pressure applies continuously across all zone types.
        delta += taxGrowthModifier;

        if (tile.zone === ZONE.RESIDENTIAL) {
          // Forest desirability bonus
          if (this.hasNearbyForest(x, y)) {
            delta += 1;
          }
          // Essential services desirability bonuses
          if (tile.services) {
            if (tile.services.police) delta += 1;
            if (tile.services.fire) delta += 1;
            if (tile.services.hospital) delta += 1;
            if (tile.services.school) delta += 1;
            if (tile.services.library) delta += 1;
            if (tile.services.cityHall) delta += 2;
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

        tile.growthScore = Math.min(
          GROWTH_CONFIG.MAX_SCORE,
          Math.max(0, tile.growthScore + delta),
        );

        if (tile.density === DENSITY.LIGHT && tile.growthScore >= GROWTH_CONFIG.THRESHOLD_MEDIUM) {
          tile.density = DENSITY.MEDIUM;
        }
        if (tile.density === DENSITY.MEDIUM && tile.growthScore >= GROWTH_CONFIG.THRESHOLD_HIGH) {
          tile.density = DENSITY.HIGH;
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
      serviceExpenses: 0,
      avgPollution: 0,
      maxPollution: 0,
      totalJobsProvided: 0,
      totalEmployablePopulation: 0,
      jobsFilled: 0,
      jobsAvailable: 0,
      employmentRate: 0,
      crimeTaxLoss: 0,
      zones: {
        residential: { light: 0, medium: 0, high: 0 },
        commercial: { light: 0, medium: 0, high: 0 },
        industrial: { light: 0, medium: 0, high: 0 },
      },
    };

    for (const p of this.grid.producers) {
      if (!this.grid.isRoadAdjacent(p.x, p.y)) continue;
      if (POWER_PRODUCER_TYPES.includes(p.type)) stats.powerCapacity += p.capacity;
      if (p.type === 'water_tower') stats.waterCapacity += p.capacity;
      if (p.type === 'sewage_plant') stats.sewageCapacity += p.capacity;
      if (p.runningCost) stats.serviceExpenses += p.runningCost;
      if (p.type === PRODUCER_TYPE.SURVEY_STATION && p.surveyTarget) {
        stats.powerDemand += 10;
      }
      if (p.totalJobs && p.totalJobs > 0) stats.totalJobsProvided += p.totalJobs;
    }

    stats.roadExpenses = this.grid.tiles.flat().filter((tile) => tile.hasRoad).length * ROAD_MAINTENANCE_COST;

    let totalPollution = 0;
    let tileCount = 0;
    const highTaxPressure = this.getHighTaxPressure();
    const jobsMultiplier = 1 - highTaxPressure * LABOR_TAX_GROWTH_CONFIG.MAX_HIGH_TAX_JOBS_REDUCTION;

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
          tile.totalJobs = Math.max(0, Math.round(jobs * jobsMultiplier));
          stats.totalJobsProvided += tile.totalJobs;
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

    // Deduct tax revenue lost to crime on each zoned tile
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);
        if (tile.zone === ZONE.NONE) continue;

        let tileBaseTax = 0;
        if (tile.zone === ZONE.RESIDENTIAL) {
          tileBaseTax = (tile.population || 0) / TAX_REVENUE_CONFIG.RESIDENTS_PER_TAX_UNIT * TAX_REVENUE_CONFIG.MONEY_PER_TAX_UNIT * (this.taxRate / 100);
        } else {
          tileBaseTax = (tile.filledJobs || 0) / TAX_REVENUE_CONFIG.EMPLOYED_PER_TAX_UNIT * TAX_REVENUE_CONFIG.MONEY_PER_TAX_UNIT * (this.taxRate / 100);
        }

        const crimeTaxPenalty = Math.min(
          CRIME_CONFIG.MAX_TAX_LOSS_RATIO,
          (tile.crime || 0) * CRIME_CONFIG.TAX_LOSS_PER_CRIME_POINT,
        );
        const tileLoss = tileBaseTax * crimeTaxPenalty;
        stats.crimeTaxLoss += tileLoss;
      }
    }

    const taxBase = (stats.population / TAX_REVENUE_CONFIG.RESIDENTS_PER_TAX_UNIT) +
      (stats.jobsFilled / TAX_REVENUE_CONFIG.EMPLOYED_PER_TAX_UNIT);
    stats.incomePerTick = Math.round(taxBase * TAX_REVENUE_CONFIG.MONEY_PER_TAX_UNIT * (this.taxRate / 100) - stats.crimeTaxLoss);
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
      progress = tHigh > 0 ? Math.min(1, (gs - tHigh) / (GROWTH_CONFIG.MAX_SCORE - tHigh)) : 1;
    }
    return Math.round(capacity * Math.max(0, progress));
  }

  getHighTaxPressure() {
    return Math.min(
      1,
      Math.max(0, this.taxRate - LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE) /
        (LABOR_TAX_GROWTH_CONFIG.MAX_TAX_RATE - LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE),
    );
  }

  getTaxGrowthModifier() {
    const rate = Math.min(LABOR_TAX_GROWTH_CONFIG.MAX_TAX_RATE, Math.max(0, this.taxRate));
    if (rate <= LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE) {
      return -rate / LABOR_TAX_GROWTH_CONFIG.GROWTH_NEUTRAL_RATE;
    }

    const outflowProgress = (rate - LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE) /
      (LABOR_TAX_GROWTH_CONFIG.MAX_TAX_RATE - LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE);
    const startPenalty = -LABOR_TAX_GROWTH_CONFIG.POPULATION_OUTFLOW_START_RATE /
      LABOR_TAX_GROWTH_CONFIG.GROWTH_NEUTRAL_RATE;
    return startPenalty - (LABOR_TAX_GROWTH_CONFIG.MAX_OUTFLOW_GROWTH_PENALTY - Math.abs(startPenalty)) * outflowProgress ** 2;
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
