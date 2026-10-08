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
  assert.deepStrictEqual(roads.map((tile) => tile.roadDamage), [10, 10, 0, 0], 'The unfunded half should be sampled without replacement and take 10% damage');
  assert.strictEqual(ROAD_MAINTENANCE_CONFIG.DAMAGE_PER_UNFUNDED_TICK, 10);
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
