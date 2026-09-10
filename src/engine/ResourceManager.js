import {
  FACTORY_RECIPES,
  HAPPINESS_CONFIG,
  LABOR_TAX_GROWTH_CONFIG,
  PRODUCER_CONFIG,
  PRODUCER_TYPE,
  RESOURCE_CONFIG,
  ZONE,
} from '../config.js';

const EMPTY_STOCKPILE = {
  food: 0,
  coal: 0,
  oil: 0,
  fuel: 0,
  ironOre: 0,
  bauxiteOre: 0,
  ironBar: 0,
  bauxiteBar: 0,
  consumerGoods: 0,
  arms: 0,
  tanks: 0,
};

export class ResourceManager {
  constructor() {
    this.stockpile = { ...EMPTY_STOCKPILE };
    this.capacity = { ore: 0, bar: 0, goods: 0 };
  }

  prepareTick(grid) {
    const coalCapacity = PRODUCER_CONFIG[PRODUCER_TYPE.COAL_PLANT].capacity;
    for (const producer of grid.producers) {
      if (producer.type === PRODUCER_TYPE.COAL_PLANT && !producer.destroyed) {
        producer.capacity = coalCapacity;
      }
    }
  }

  update(grid, stats) {
    this.capacity = this.getWarehouseCapacity(grid);
    this.updateProducerJobs(grid, stats.employmentRate || 0);
    this.extractFromMines(grid);
    this.smelt(grid);
    this.produceFactories(grid);
    this.consumeCoalForPower(grid);
    const foodResult = this.consumeFood(grid, stats.population || 0);
    const goodsDemand = (stats.population || 0) * RESOURCE_CONFIG.CONSUMER_GOODS_PER_RESIDENT;
    const goodsRatio = goodsDemand > 0 ? Math.min(1, this.stockpile.consumerGoods / goodsDemand) : 0;
    const goodsBonus = goodsRatio * HAPPINESS_CONFIG.CONSUMER_GOODS_MAX_BONUS;
    stats.happiness = Math.max(
      0,
      goodsBonus -
        (stats.untreatedPatients || 0) * HAPPINESS_CONFIG.UNTREATED_PATIENT_PENALTY -
        this.getCrimePenalty(grid) -
        (stats.fireInjuries || 0) * HAPPINESS_CONFIG.FIRE_INJURY_PENALTY,
    );
    stats.happinessGrowthModifier = stats.happiness * HAPPINESS_CONFIG.GROWTH_DELTA_PER_POINT;
    stats.foodShortfall = foodResult.shortfall;
    this.clampToCapacity();
  }

  getWarehouseCapacity(grid) {
    const capacity = { ore: 0, bar: 0, goods: 0, oil: 0, fuel: 0 };
    for (const producer of grid.producers) {
      if (!producer.operational) continue;
      if (producer.type === PRODUCER_TYPE.WAREHOUSE_ORE) capacity.ore += RESOURCE_CONFIG.WAREHOUSE_CAPACITY_PER_TILE;
      if (producer.type === PRODUCER_TYPE.WAREHOUSE_BAR) capacity.bar += RESOURCE_CONFIG.WAREHOUSE_CAPACITY_PER_TILE;
      if (producer.type === PRODUCER_TYPE.WAREHOUSE_GOODS) capacity.goods += RESOURCE_CONFIG.WAREHOUSE_CAPACITY_PER_TILE;
      if (producer.type === PRODUCER_TYPE.SILO) capacity[producer.storageType || 'oil'] += RESOURCE_CONFIG.SILO_CAPACITY;
    }
    return capacity;
  }

  updateProducerJobs(grid, employmentRate) {
    for (const producer of grid.producers) {
      const config = PRODUCER_CONFIG[producer.type];
      if (!config?.jobs || producer.type === PRODUCER_TYPE.FIRE_STATION) continue;
      const maxJobs = config.jobs.light;
      producer.totalJobs = maxJobs;
      producer.filledJobs = Math.round(maxJobs * Math.max(LABOR_TAX_GROWTH_CONFIG.MIN_SERVICE_EMPLOYMENT_RATE, employmentRate));
    }
  }

  extractFromMines(grid) {
    const outputs = {
      [PRODUCER_TYPE.MINE_IRON]: 'ironOre',
      [PRODUCER_TYPE.MINE_BAUXITE]: 'bauxiteOre',
      [PRODUCER_TYPE.MINE_COAL]: 'coal',
      [PRODUCER_TYPE.OIL_DERRICK]: 'oil',
    };
    for (const producer of grid.producers) {
      const output = outputs[producer.type];
      if (!output || !producer.operational) continue;
      const amount = (producer.filledJobs || 0) * RESOURCE_CONFIG.MINE_EXTRACTION_PER_JOB;
      this.stockpile[output] += amount;
    }
  }

  smelt(grid) {
    for (const producer of grid.producers) {
      if (producer.type !== PRODUCER_TYPE.SMELTER || !producer.operational) continue;
      let remainingJobs = producer.filledJobs || 0;
      for (const [input, output] of [['ironOre', 'ironBar'], ['bauxiteOre', 'bauxiteBar']]) {
        if (remainingJobs <= 0) break;
        const possible = Math.min(
          remainingJobs * RESOURCE_CONFIG.SMELTER_BARS_PER_JOB,
          this.stockpile[input] / RESOURCE_CONFIG.SMELTER_ORE_PER_BAR,
          this.stockpile.coal / RESOURCE_CONFIG.SMELTER_COAL_PER_BAR,
        );
        if (possible <= 0) continue;
        this.stockpile[input] -= possible * RESOURCE_CONFIG.SMELTER_ORE_PER_BAR;
        this.stockpile.coal -= possible * RESOURCE_CONFIG.SMELTER_COAL_PER_BAR;
        this.stockpile[output] += possible;
        remainingJobs -= possible / RESOURCE_CONFIG.SMELTER_BARS_PER_JOB;
      }
    }
  }

  produceFactories(grid) {
    for (const tile of grid.tiles.flat()) {
      if (tile.zone !== ZONE.INDUSTRIAL || tile.destroyed || tile.onFire) continue;
      const recipe = FACTORY_RECIPES[tile.recipe] || FACTORY_RECIPES.CONSUMER_GOODS;
      const requested = (tile.filledJobs || 0) * recipe.rate;
      const possible = Object.entries(recipe.inputs).reduce((amount, [input, required]) => (
        Math.min(amount, this.stockpile[input] / required)
      ), requested);
      if (Object.keys(recipe.inputs).length > 0 && possible <= 0) continue;
      for (const [input, required] of Object.entries(recipe.inputs)) this.stockpile[input] -= possible * required;
      this.stockpile[recipe.output] += possible;
    }
  }

  consumeCoalForPower(grid) {
    for (const producer of grid.producers) {
      if (producer.type !== PRODUCER_TYPE.COAL_PLANT) continue;
      const fuel = (producer.usedCapacity || 0) * RESOURCE_CONFIG.COAL_PLANT_FUEL_PER_MW;
      if (fuel > this.stockpile.coal) {
        this.stockpile.coal = 0;
        producer.capacity = 0;
        producer.operational = false;
      } else {
        this.stockpile.coal -= fuel;
      }
    }
  }

  consumeFood(grid, population) {
    const demand = population * RESOURCE_CONFIG.FOOD_PER_RESIDENT;
    const consumed = Math.min(this.stockpile.food, demand);
    const shortfall = Math.max(0, demand - consumed);
    this.stockpile.food -= consumed;
    if (shortfall > 0) {
      for (const tile of grid.tiles.flat()) {
        if (tile.zone !== ZONE.RESIDENTIAL || tile.destroyed) continue;
        const loss = Math.ceil((tile.population || 0) * HAPPINESS_CONFIG.UNFED_OUTFLOW_PERCENT);
        tile.populationLoss = (tile.populationLoss || 0) + loss;
      }
    }
    return { shortfall };
  }

  getCrimePenalty(grid) {
    return grid.tiles.flat().reduce((sum, tile) => sum + (tile.crime || 0), 0) * HAPPINESS_CONFIG.CRIME_POINT_PENALTY;
  }

  clampToCapacity() {
    const limits = {
      ironOre: this.capacity.ore,
      bauxiteOre: this.capacity.ore,
      coal: this.capacity.ore,
      oil: this.capacity.oil,
      fuel: this.capacity.fuel,
      ironBar: this.capacity.bar,
      bauxiteBar: this.capacity.bar,
      food: this.capacity.goods,
      consumerGoods: this.capacity.goods,
      arms: this.capacity.goods,
      tanks: this.capacity.goods,
    };
    for (const [key, limit] of Object.entries(limits)) this.stockpile[key] = Math.min(this.stockpile[key], limit);
  }

  snapshot() {
    return { stockpile: { ...this.stockpile }, capacity: { ...this.capacity } };
  }
}