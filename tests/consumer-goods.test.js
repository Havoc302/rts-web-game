import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';
import { DENSITY, HAPPINESS_CONFIG, TERRAIN, ZONE } from '../src/config.js';

{
  const manager = new ResourceManager();
  manager.stockpile.consumerGoods = 10;
  const result = manager.consumeConsumerGoods(100);
  assert.ok(result.consumed > 0, 'Population should consume consumer goods');
  assert.ok(manager.stockpile.consumerGoods < 10, 'Goods stockpile should fall with use');
  assert.ok(result.goodsRatio <= 1, 'Goods ratio is consumed / demand');
}

{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const residential = grid.getTile(1, 1);
  residential.zone = ZONE.RESIDENTIAL;
  residential.density = DENSITY.HIGH;
  residential.growthScore = 50;
  grid.activeZonedTiles.add(residential);
  const commercial = grid.getTile(1, 2);
  commercial.zone = ZONE.COMMERCIAL;
  commercial.density = DENSITY.HIGH;
  grid.activeZonedTiles.add(commercial);

  const sim = new Simulation(grid);
  sim.taxRate = 50;
  sim.stats.goodsRatio = 0;
  sim.computeStats();
  const withoutGoods = sim.stats.incomePerTick;
  sim.stats.goodsRatio = 1;
  sim.computeStats();
  assert.ok(sim.stats.incomePerTick > withoutGoods, 'Supplied consumer goods should double commercial tax');
}

{
  const grid = new Grid(4, 4, 1);
  const manager = new ResourceManager();
  const zero = manager.calculateHappiness(grid, { taxRate: 40, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 }, 0, false);
  const full = manager.calculateHappiness(grid, { taxRate: 40, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 }, 1, false);
  assert.ok(full - zero >= HAPPINESS_CONFIG.CONSUMER_GOODS_MAX_BONUS - 0.01, 'Goods are a happiness bonus only');
}

console.log('Consumer goods tests passed.');
