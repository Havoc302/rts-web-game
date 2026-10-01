import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { FireManager } from '../src/engine/FireManager.js';
import { formatProducerCapacity, getTileUtilityStatus } from '../src/engine/InspectorStatus.js';
import { ORE_TYPE, PRODUCER_CONFIG, PRODUCER_TYPE, TERRAIN, ZONE } from '../src/config.js';

console.log('=== uranium.test.js ===');

const grid = new Grid(20, 20, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
for (let x = 1; x < 20; x++) grid.placeRoad(x, 5);
grid.getTile(0, 4).terrain = TERRAIN.WATER;
grid.getTile(0, 6).terrain = TERRAIN.WATER;
grid.getTile(8, 3).terrain = TERRAIN.WATER;
const uraniumTile = grid.getTile(4, 6);
uraniumTile.oreDiscovered = true;
uraniumTile.discoveredOre = ORE_TYPE.URANIUM;
const mine = grid.placeProducer(4, 6, PRODUCER_TYPE.MINE_URANIUM, 0);
assert.ok(mine, 'Discovered uranium should accept a Uranium Mine');
assert.strictEqual(grid.placeProducer(4, 7, PRODUCER_TYPE.MINE_IRON, 0), null, 'Iron Mine cannot use uranium');

const nuclear = grid.placeProducer(8, 4, PRODUCER_TYPE.NUCLEAR_PLANT, PRODUCER_CONFIG[PRODUCER_TYPE.NUCLEAR_PLANT].capacity);
assert.ok(nuclear, 'Nuclear plant should place beside water and road');
const sim = new Simulation(grid);
sim.resourceManager.stockpile.uraniumOre = 0;
mine.destroyed = true;
sim.tick();
assert.strictEqual(nuclear.operational, false, 'Nuclear plant must shut down without uranium');
assert.strictEqual(nuclear.capacity, 0, 'Nuclear plant produces nothing without uranium');
assert.strictEqual(nuclear.fuelShortfall, true, 'Fuel starvation should be distinct from a utility shortfall');
assert.strictEqual(getTileUtilityStatus(grid, grid.getTile(nuclear.x, nuclear.y), 'power'), 'Offline (No Uranium)');
assert.strictEqual(formatProducerCapacity(nuclear, grid), 'Offline (No Uranium)');
assert.strictEqual(formatProducerCapacity({ ...nuclear, fuelShortfall: undefined }, grid), 'Offline (No Uranium)', 'Older saves with zero capacity should explain the outage');

sim.resourceManager.stockpile.uraniumOre = 20;
sim.tick();
assert.strictEqual(nuclear.fuelShortfall, false, 'Fuel status should clear when uranium is restored');
assert.strictEqual(nuclear.capacity, PRODUCER_CONFIG[PRODUCER_TYPE.NUCLEAR_PLANT].capacity, 'A refueled nuclear plant should generate again');

mine.operational = true;
mine.totalJobs = 10;
mine.filledJobs = 10;
nuclear.operational = true;
nuclear.capacity = PRODUCER_CONFIG[PRODUCER_TYPE.NUCLEAR_PLANT].capacity;
sim.resourceManager.stockpile.uraniumOre = 20;
sim.resourceManager.update(grid, { population: 0, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
assert.ok(sim.resourceManager.stockpile.uraniumOre < 20, 'Nuclear generation should consume uranium based on power use');

const home = grid.getTile(9, 4);
home.zone = ZONE.RESIDENTIAL;
home.population = 10;
home.maxPopulation = 25;
home.fireRepair = 1;
const nuclearTile = grid.getTile(nuclear.x, nuclear.y);
nuclearTile.onFire = true;
nuclearTile.fireDamage = 99;
grid.rebuildActiveTileSets();
const stats = { fireInjuries: 0, displacedPopulation: 0 };
FireManager.updateFires(grid, stats);
assert.ok(home.permanentPollution > 0, 'Nuclear accident should leave permanent pollution in range');
assert.ok(home.fireDisplacedPopulation > 0, 'Nuclear accident should displace half of nearby residents');
assert.ok(stats.fireInjuries > 0, 'Nuclear accident should create immediate patients');

console.log('Uranium tests passed.');
