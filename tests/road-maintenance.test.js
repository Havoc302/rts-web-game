import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { PRODUCER_TYPE, ROAD_MAINTENANCE_CONFIG, TERRAIN, UTILITY_OPERATING_COST } from '../src/config.js';
import { RoadNetwork } from '../src/engine/RoadNetwork.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';

const grid = new Grid(8, 8, 1);
for (const row of grid.tiles) {
  for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

grid.tiles[3][3].terrain = TERRAIN.WATER;
const simulation = new Simulation(grid);
simulation.computeStats();
assert.strictEqual(simulation.stats.roadExpenses, 0, 'A city with no roads should have no road maintenance cost');

grid.placeRoad(1, 1);
grid.placeRoad(1, 2);
grid.placeBridge(3, 3);
simulation.computeStats();
assert.strictEqual(simulation.stats.roadExpenses, 3, 'Each road and bridge tile should cost one per tick');
simulation.roadMaintenanceBudget = 50;
simulation.computeStats();
assert.strictEqual(simulation.stats.roadExpenses, 1.5, 'Road expenses should scale to the funded budget percentage');

grid.tiles[4][4].terrain = TERRAIN.MOUNTAIN;
assert.strictEqual(grid.canPlaceTunnel(4, 4), true, 'Tunnels should be placeable on mountain tiles');
assert.strictEqual(grid.placeTunnel(4, 4), true, 'Tunnel placement should succeed on mountain tiles');
assert.strictEqual(grid.getTile(4, 4).hasRoad, true, 'Tunnels should participate in the road network');
assert.strictEqual(grid.bulldoze(4, 4), true, 'Tunnels should be removable by bulldozing');
assert.strictEqual(grid.getTile(4, 4).hasTunnel, false, 'Bulldozing should clear the tunnel');

{
  const utilGrid = new Grid(8, 8, 1);
  for (const row of utilGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  utilGrid.getTile(0, 1).terrain = TERRAIN.WATER;
  utilGrid.getTile(0, 3).terrain = TERRAIN.WATER;
  const sim = new Simulation(utilGrid);
  utilGrid.placeProducer(1, 1, PRODUCER_TYPE.WATER_TOWER, 120);
  utilGrid.placeProducer(1, 3, PRODUCER_TYPE.SEWAGE_PLANT, 120);
  utilGrid.placeProducer(4, 4, PRODUCER_TYPE.BATTERY, 400);
  utilGrid.placeProducer(5, 4, PRODUCER_TYPE.WINDMILL, 40);
  utilGrid.placeProducer(6, 6, PRODUCER_TYPE.SCHOOL);
  sim.computeStats();
  assert.strictEqual(sim.stats.utilityExpenses, 4 * UTILITY_OPERATING_COST, 'Pump, sewage plant, battery, and generator each cost per tick; services do not');
}

{
  const fundedGrid = new Grid(8, 8, 1);
  for (const row of fundedGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const roads = [1, 2, 3, 4].map((x) => {
    fundedGrid.placeRoad(x, 3);
    return fundedGrid.getTile(x, 3);
  });
  const sim = new Simulation(fundedGrid);
  sim.roadMaintenanceBudget = 50;
  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    sim.updateRoadMaintenance();
  } finally {
    Math.random = previousRandom;
  }
  assert.deepStrictEqual(roads.map((tile) => tile.roadDamage), [10, 10, 0, 0], 'Half the network should be rolled and, with the hit roll forced, take one hit of damage');
  assert.strictEqual(ROAD_MAINTENANCE_CONFIG.DAMAGE_PER_HIT, 10, 'One hit should be a tenth of a road tile');
  assert.strictEqual(ROAD_MAINTENANCE_CONFIG.DAMAGE_ROLL_CHANCE, 0.05, 'Each rolled tile should have a flat 5% chance of taking a hit');
}

{
  // Rolled tiles are only damaged when the 5% hit roll succeeds, so an unlucky budget
  // does not guarantee damage every tick.
  const missGrid = new Grid(8, 8, 1);
  for (const row of missGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const streets = [1, 2, 3, 4].map((x) => {
    missGrid.placeRoad(x, 3);
    return missGrid.getTile(x, 3);
  });
  const sim = new Simulation(missGrid);
  sim.roadMaintenanceBudget = 50;
  const previousRandom = Math.random;
  Math.random = () => 0.5;
  try {
    sim.updateRoadMaintenance();
  } finally {
    Math.random = previousRandom;
  }
  assert.deepStrictEqual(streets.map((tile) => tile.roadDamage), [0, 0, 0, 0], 'A failed hit roll should leave every rolled tile untouched');
}

{
  // The roll count scales linearly with the missing budget: 100 roads at 99% funding rolls a
  // single tile, at 50% funding it rolls fifty, and each roll only lands 5% of the time.
  const buildCity = (budget) => {
    const cityGrid = new Grid(104, 4, 1);
    for (const row of cityGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
    for (let x = 1; x <= 100; x++) cityGrid.placeRoad(x, 1);
    const citySim = new Simulation(cityGrid);
    citySim.roadMaintenanceBudget = budget;
    return { cityGrid, citySim };
  };

  const countRolled = (budget) => {
    const { cityGrid, citySim } = buildCity(budget);
    const previousRandom = Math.random;
    Math.random = () => 0;
    try {
      citySim.updateRoadMaintenance();
    } finally {
      Math.random = previousRandom;
    }
    return Array.from(cityGrid.activeRoadTiles).filter((tile) => tile.roadDamage > 0).length;
  };

  assert.strictEqual(countRolled(100), 0, 'A fully funded network should roll no damage at all');
  assert.strictEqual(countRolled(99), 1, '99% funding on 100 road tiles should roll exactly one tile');
  assert.strictEqual(countRolled(50), 50, '50% funding on 100 road tiles should roll half the network');

  // A deterministic LCG keeps the long-run rate check reproducible between runs.
  const makeLcg = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const hitsPerTick = (budget, ticks) => {
    const { cityGrid, citySim } = buildCity(budget);
    let hits = 0;
    for (let tick = 0; tick < ticks; tick++) {
      citySim.updateRoadMaintenance();
      const damaged = Array.from(cityGrid.activeRoadTiles).filter((tile) => tile.roadDamage > 0);
      hits += damaged.length;
      for (const tile of damaged) tile.roadDamage = 0;
    }
    return hits / ticks;
  };

  const previousRandom = Math.random;
  const lcg = makeLcg(20261014);
  Math.random = lcg;
  try {
    const barelyFunded = hitsPerTick(99, 4000);
    const halfFunded = hitsPerTick(50, 2000);
    assert.ok(Math.abs(barelyFunded - 0.05) < 0.03, `99% funding should damage about 0.05 tiles per tick, saw ${barelyFunded}`);
    assert.ok(Math.abs(halfFunded - 2.5) < 0.35, `50% funding should damage about 2.5 tiles per tick, saw ${halfFunded}`);
    assert.ok(halfFunded > barelyFunded * 20, 'Damage rate should scale with the missing budget');
  } finally {
    Math.random = previousRandom;
  }
}

{
  // Restoring full funding heals the network one tile per tick, worst damage first,
  // until every standing road is pristine.
  const healGrid = new Grid(8, 8, 1);
  for (const row of healGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  const worn = [1, 2, 3].map((x) => {
    healGrid.placeRoad(x, 3);
    return healGrid.getTile(x, 3);
  });
  const sim = new Simulation(healGrid);
  worn[0].roadDamage = 20;
  worn[1].roadDamage = 90;
  worn[2].roadDamage = 50;

  sim.roadMaintenanceBudget = 100;
  sim.updateRoadMaintenance();
  assert.deepStrictEqual(worn.map((tile) => tile.roadDamage), [20, 0, 50], 'The worst road should be repaired first at one tile per tick');
  sim.updateRoadMaintenance();
  assert.deepStrictEqual(worn.map((tile) => tile.roadDamage), [20, 0, 0], 'The next tick should repair the next-worst road');
  sim.updateRoadMaintenance();
  assert.deepStrictEqual(worn.map((tile) => tile.roadDamage), [0, 0, 0], 'The network should be fully repaired one tile per tick');
  assert.strictEqual(sim.repairRoadTile(), null, 'A pristine network should have nothing left to repair');
  assert.strictEqual(healGrid.activeRoadTiles.size, 3, 'Repairing should keep every road in the active network');
}

{
  // Wrecked roads are rubble rather than wear: repairs skip them, but the tile must be
  // clearable with bulldoze so the player can rebuild there.
  const wreckGrid = new Grid(6, 6, 1);
  for (const row of wreckGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  wreckGrid.placeRoad(2, 2);
  wreckGrid.placeRoad(3, 2);
  const wreck = wreckGrid.getTile(2, 2);
  const healthy = wreckGrid.getTile(3, 2);
  wreck.roadDamage = 90;
  assert.strictEqual(wreckGrid.damageRoad(wreck, 10), true, 'The final hit should wreck the road');
  assert.strictEqual(wreck.destroyed, true);
  assert.strictEqual(wreck.hasRoad, false);
  assert.strictEqual(wreckGrid.activeRoadTiles.has(wreck), false, 'A wrecked road should leave the active network');

  const wreckSim = new Simulation(wreckGrid);
  wreckSim.roadMaintenanceBudget = 100;
  for (let tick = 0; tick < 5; tick++) wreckSim.updateRoadMaintenance();
  assert.strictEqual(wreck.destroyed, true, 'Full funding should not rebuild a wrecked road tile');
  assert.strictEqual(wreck.roadDamage, 100, 'Repairs should leave wrecked rubble untouched');
  assert.strictEqual(healthy.roadDamage, 0, 'Repairs should not disturb healthy roads');

  assert.strictEqual(wreckGrid.canPlaceRoad(2, 2), false, 'A wrecked road tile should block rebuilding until it is cleared');
  assert.strictEqual(wreckGrid.bulldoze(2, 2), true, 'A wrecked road tile should be bulldozable');
  assert.strictEqual(wreck.destroyed, false, 'Bulldozing should clear the wreck');
  assert.strictEqual(wreck.roadDamage, 0, 'Bulldozing should clear the damage');
  assert.strictEqual(wreckGrid.canPlaceRoad(2, 2), true, 'The cleared tile should accept a new road');
  assert.strictEqual(wreckGrid.placeRoad(2, 2), true, 'A road should be rebuildable on the cleared tile');
  assert.strictEqual(wreckGrid.activeRoadTiles.size, 2, 'The rebuilt road should rejoin the active network');
}

{
  const routeGrid = new Grid(10, 8, 1);
  for (const row of routeGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  for (let x = 1; x <= 5; x++) routeGrid.placeRoad(x, 3);
  const producer = { id: 1, x: 0, y: 3, type: PRODUCER_TYPE.POWER_PLANT };
  routeGrid.producers.push(producer);
  const brokenRoad = routeGrid.getTile(3, 3);
  const connectedBefore = RoadNetwork.computeRoadDistances(routeGrid, [producer]);
  assert.ok(connectedBefore.has('5,3'), 'A path should reach roads beyond the future break');
  brokenRoad.roadDamage = 90;
  const previousCoverageVersion = routeGrid.coverageVersion;
  assert.strictEqual(routeGrid.damageRoad(brokenRoad, 10), true, 'The final 10% damage should destroy the road tile');
  assert.strictEqual(brokenRoad.hasRoad, false);
  assert.strictEqual(brokenRoad.hasBridge, false);
  assert.strictEqual(brokenRoad.hasTunnel, false);
  assert.strictEqual(brokenRoad.destroyed, true);
  assert.strictEqual(routeGrid.activeRoadTiles.has(brokenRoad), false);
  assert.strictEqual(routeGrid.coverageVersion, previousCoverageVersion + 1, 'Road destruction should invalidate cached paths');
  const disconnected = RoadNetwork.computeRoadDistances(routeGrid, [producer]);
  assert.ok(!disconnected.has('5,3'), 'The disconnected road segment must leave the route graph');

  for (let x = 1; x <= 5; x++) {
    routeGrid.placeRoad(x, 2);
    routeGrid.placeRoad(x, 4);
  }
  routeGrid.placeRoad(1, 3);
  routeGrid.placeRoad(5, 3);
  const alternateRoute = RoadNetwork.computeRoadDistances(routeGrid, [producer]);
  assert.ok(alternateRoute.has('5,3'), 'An alternate road route should keep the far side connected');
}

{
  const utilityGrid = new Grid(10, 8, 1);
  for (const row of utilityGrid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  utilityGrid.getTile(1, 2).terrain = TERRAIN.WATER;
  const water = utilityGrid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 120);
  for (let x = 2; x <= 5; x++) utilityGrid.placeRoad(x, 3);
  const home = utilityGrid.getTile(6, 3);
  home.zone = 'residential';
  home.population = 25;
  utilityGrid.activeZonedTiles.add(home);
  UtilityManager.allocateAll(utilityGrid);
  assert.strictEqual(home.shortfall.water, false, 'A connected water source should service the home');

  const connector = utilityGrid.getTile(4, 3);
  connector.roadDamage = 90;
  utilityGrid.damageRoad(connector, 10);
  UtilityManager.allocateAll(utilityGrid);
  assert.strictEqual(home.shortfall.water, true, 'A destroyed sole road connection should cut water service');
  assert.strictEqual(water.utilityShortfall.power, true, 'A destroyed sole road connection should also cut producer utility access');
}

console.log('Road maintenance tests passed.');
