import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { ResourceManager } from '../src/engine/ResourceManager.js';
import { PRODUCER_TYPE, TERRAIN, ORE_TYPE, RESOURCE_CONFIG } from '../src/config.js';

const grid = new Grid(10, 10, 7);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;

const mineTile = grid.getTile(2, 2);
mineTile.oreDiscovered = true;
mineTile.discoveredOre = ORE_TYPE.IRON_ORE;
assert.ok(grid.placeProducer(2, 2, PRODUCER_TYPE.MINE_IRON, 0), 'Matching discovered ore should allow mine placement');
assert.strictEqual(grid.canPlaceProducer(4, 4, PRODUCER_TYPE.MINE_IRON), false, 'Mine placement should require discovered matching ore');
const mountainMineTile = grid.getTile(3, 3);
mountainMineTile.terrain = TERRAIN.MOUNTAIN;
mountainMineTile.oreDiscovered = true;
mountainMineTile.discoveredOre = ORE_TYPE.BAUXITE;
assert.ok(grid.placeProducer(3, 3, PRODUCER_TYPE.MINE_BAUXITE, 0), 'Mines should be placeable on discovered non-water ore terrain');
const oilTile = grid.getTile(4, 4);
oilTile.oreDiscovered = true;
oilTile.discoveredOre = ORE_TYPE.OIL;
assert.ok(grid.placeProducer(4, 4, PRODUCER_TYPE.OIL_DERRICK, 0), 'Oil derricks should require discovered oil');
assert.ok(grid.placeProducer(5, 4, PRODUCER_TYPE.WAREHOUSE_ORE, 0));

const manager = new ResourceManager();
const mine = grid.producers.find((producer) => producer.type === PRODUCER_TYPE.MINE_IRON);
mine.operational = true;
mine.filledJobs = 10;
manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
assert.strictEqual(manager.stockpile.ironOre, RESOURCE_CONFIG.MINE_EXTRACTION_PER_JOB * 10);
assert.strictEqual(manager.capacity.ore, RESOURCE_CONFIG.WAREHOUSE_CAPACITY_PER_TILE);

const smelter = grid.placeProducer(6, 6, PRODUCER_TYPE.SMELTER, 0);
const barWarehouse = grid.placeProducer(7, 6, PRODUCER_TYPE.WAREHOUSE_BAR, 0);
grid.placeProducer(7, 7, PRODUCER_TYPE.WAREHOUSE_GOODS, 0);
const silo = grid.placeProducer(8, 6, PRODUCER_TYPE.SILO, 0);
assert.strictEqual(silo.storageType, 'oil', 'Silos should default to oil storage');
assert.strictEqual(manager.capacity.oil, 0, 'Silo capacity is calculated during a resource update');
smelter.operational = true;
smelter.filledJobs = 10;
manager.stockpile.ironOre = 10;
manager.stockpile.coal = 5;
manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
assert.ok(manager.stockpile.ironBar > 0, 'Smelter should convert ore and coal into iron bars');
assert.ok(barWarehouse, 'Bar warehouse should be accepted as a storage producer');

const industrialTile = grid.getTile(8, 8);
industrialTile.zone = 'industrial';
industrialTile.filledJobs = 10;
industrialTile.recipe = 'FOOD';
manager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
assert.ok(manager.stockpile.food > 0, 'Industrial recipe should produce food');

const residentialTile = grid.getTile(1, 8);
residentialTile.zone = 'residential';
residentialTile.population = 20;
industrialTile.destroyed = true;
manager.stockpile.food = 0;
manager.update(grid, { population: 20, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
assert.ok(residentialTile.populationLoss > 0, 'Food shortfall should create residential outflow');

console.log('Resource management tests passed.');