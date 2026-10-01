import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';
import { DENSITY, FACTORY_RECIPES, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

console.log('=== industrial-inputs.test.js ===');

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
grid.placeRoad(1, 1);
grid.placeZone(1, 2, ZONE.INDUSTRIAL);
const factory = grid.getTile(1, 2);
factory.density = DENSITY.LIGHT;
factory.filledJobs = 10;
factory.totalJobs = 10;
factory.recipe = 'CONSUMER_GOODS';
const manager = new ResourceManager();
manager.stockpile.ironBar = 100;
manager.stockpile.bauxiteBar = 100;
manager.stockpile.oil = 100;
manager.produceFactories(grid);
assert.ok(manager.stockpile.consumerGoods > 0, 'Consumer goods should be produced with aluminium, iron, and oil');
assert.strictEqual(manager.stockpile.ironBar, 99);
assert.strictEqual(manager.stockpile.bauxiteBar, 99);
assert.strictEqual(manager.stockpile.oil, 98);

for (const input of ['ironBar', 'bauxiteBar', 'oil']) {
  const isolated = new ResourceManager();
  isolated.stockpile.ironBar = 100;
  isolated.stockpile.bauxiteBar = 100;
  isolated.stockpile.oil = 100;
  isolated.stockpile[input] = 0;
  isolated.produceFactories(grid);
  assert.strictEqual(isolated.stockpile.consumerGoods, 0, `${input} shortfall should stop consumer goods production`);
}

assert.deepStrictEqual(Object.keys(FACTORY_RECIPES.CONSUMER_GOODS.inputs).sort(), ['bauxiteBar', 'ironBar', 'oil']);
console.log('Industrial input tests passed.');
