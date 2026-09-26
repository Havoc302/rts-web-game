import assert from 'assert';
import { TrafficManager, getAdjacentRoadTiles } from '../src/engine/TrafficManager.js';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { TERRAIN, TILE_SIZE } from '../src/config.js';

function flatten(grid) {
  for (const row of grid.tiles) {
    for (const tile of row) {
      tile.terrain = TERRAIN.FLAT;
    }
  }
}

console.log('=== traffic-manager.test.js ===');

// 1. Density Math
{
  const tm = new TrafficManager({ maxCarsPerRoadTile: 0.3 });
  assert.strictEqual(tm.calculateTargetCarCount(0, 100, 50), 0, 'Zero population produces zero cars');
  assert.strictEqual(tm.calculateTargetCarCount(0, 0, 50), 0, 'Zero population with zero capacity produces zero cars');

  // 100 roads, 80 pop / 100 cap -> 0.8 saturation -> 100 * 0.8 * 0.3 = 24
  const count = tm.calculateTargetCarCount(80, 100, 100);
  assert.strictEqual(count, 24, 'Partial saturation calculates expected car count');

  // Over-capacity population is capped at 1.0 saturation
  const cappedCount = tm.calculateTargetCarCount(200, 100, 100);
  assert.strictEqual(cappedCount, 30, 'Over-capacity population caps saturation at 1.0');
}

// 2. Road Adjacency & Particle Syncing
{
  const grid = new Grid(20, 20);
  flatten(grid);
  grid.placeRoad(5, 5);
  grid.placeRoad(6, 5);
  grid.placeRoad(7, 5);

  const neighbors = getAdjacentRoadTiles(6, 5, grid);
  assert.strictEqual(neighbors.length, 2, 'Middle road tile has 2 road neighbors');

  const tm = new TrafficManager({ grid });
  tm.rebuildRoadCache(grid);
  assert.strictEqual(tm.getAdjacentRoadTiles(6, 5, grid).length, 2, 'Cached road adjacency matches grid neighbors');

  // Sync car count up
  tm.syncCarCount(5, tm.activeRoadArray);
  assert.strictEqual(tm.cars.length, 5, 'Spawns target number of cars');

  for (const car of tm.cars) {
    assert(car.x >= 5.5 && car.x <= 7.5, 'Car spawned on valid road coordinates');
    assert(car.y === 5.5, 'Car spawned on road y coordinate');
    assert(typeof car.speed === 'number' && car.speed > 0, 'Car has valid speed');
    assert(typeof car.color === 'string' && car.color.length > 0, 'Car has valid color');
  }

  // Sync car count down
  tm.syncCarCount(2, tm.activeRoadArray);
  assert.strictEqual(tm.cars.length, 2, 'Trims cars to new lower target count');
}

// 3. Movement Logic & U-Turn Prevention
{
  const grid = new Grid(20, 20);
  flatten(grid);
  // Straight 3-tile road: (5,5) - (6,5) - (7,5)
  grid.placeRoad(5, 5);
  grid.placeRoad(6, 5);
  grid.placeRoad(7, 5);

  const tm = new TrafficManager({ grid });
  tm.rebuildRoadCache(grid);

  // Place a car arriving at (6.5, 5.5) from (5,5)
  tm.cars = [{
    x: 6.5,
    y: 5.5,
    targetX: 6.5,
    targetY: 5.5,
    prevTileX: 5,
    prevTileY: 5,
    speed: 0.05,
    color: '#ff4d4d',
  }];

  // Update step with car reaching target
  tm.update(1.0, grid);

  // Because car arrived from (5,5) to (6,5), and (6,5) has neighbors (5,5) and (7,5),
  // forward-choice filtering should steer toward (7,5) instead of immediately turning around to (5,5)
  const car = tm.cars[0];
  assert.strictEqual(car.targetX, 7.5, 'Car continues forward through road intersection/segment');
  assert.strictEqual(car.targetY, 5.5, 'Car stays on road track');
}

// 4. Dead-End & Bulldoze Handling
{
  const grid = new Grid(20, 20);
  flatten(grid);
  grid.placeRoad(10, 10);
  grid.placeRoad(11, 10);

  const tm = new TrafficManager({ grid });
  tm.rebuildRoadCache(grid);

  // Car arriving at dead-end (11,10) coming from (10,10)
  tm.cars = [{
    x: 11.5,
    y: 10.5,
    targetX: 11.5,
    targetY: 10.5,
    prevTileX: 10,
    prevTileY: 10,
    speed: 0.1,
    color: '#4d79ff',
  }];

  // Step into dead-end: should turn around to (10,10) since it is the only neighbor
  tm.update(1.0, grid);
  assert.strictEqual(tm.cars[0].targetX, 10.5, 'Car turns around at dead-end');

  // Now bulldoze (10,10) and (11,10), and place a new road at (2,2)
  grid.bulldoze(10, 10);
  grid.bulldoze(11, 10);
  grid.placeRoad(2, 2);
  tm.rebuildRoadCache(grid);

  // Stepping should respawn the car on active road (2,2)
  tm.update(1.0, grid);
  assert.strictEqual(tm.cars[0].targetX, 2.5, 'Car stranded on bulldozed road respawns on active road');
  assert.strictEqual(tm.cars[0].targetY, 2.5, 'Car stranded on bulldozed road respawns on active road');
}

// 5. Batched Rendering & Culling
{
  const tm = new TrafficManager();
  tm.cars = [
    { x: 1.5, y: 1.5, targetX: 2.5, targetY: 1.5, speed: 0.02, color: '#ff4d4d' },
    { x: 2.5, y: 1.5, targetX: 3.5, targetY: 1.5, speed: 0.02, color: '#ff4d4d' },
    { x: 100.5, y: 100.5, targetX: 101.5, targetY: 100.5, speed: 0.02, color: '#4d79ff' }, // offscreen
  ];

  const fillStyleAssignments = [];
  const fillRectCalls = [];
  let saveCalled = false;
  let restoreCalled = false;

  const mockCtx = {
    get fillStyle() { return ''; },
    set fillStyle(val) { fillStyleAssignments.push(val); },
    save() { saveCalled = true; },
    restore() { restoreCalled = true; },
    fillRect(x, y, w, h) { fillRectCalls.push({ x, y, w, h }); },
  };

  const visibleBounds = { left: 0, top: 0, right: 200, bottom: 200 };
  tm.draw(mockCtx, TILE_SIZE, { x: 0, y: 0 }, visibleBounds);

  assert(saveCalled && restoreCalled, 'ctx.save and ctx.restore called');
  assert.strictEqual(fillStyleAssignments.length, 1, 'Batched rendering sets fillStyle only once for color');
  assert.strictEqual(fillStyleAssignments[0], '#ff4d4d', 'Batch color matches on-screen car');
  assert.strictEqual(fillRectCalls.length, 2, 'Only the 2 on-screen cars are rendered; offscreen car culled');
}

// 6. Integration with Simulation Stats & Grid
{
  const grid = new Grid(20, 20);
  flatten(grid);
  for (let i = 0; i < 10; i++) {
    grid.placeRoad(i, 5);
  }
  const sim = new Simulation(grid);
  sim.computeStats();

  assert.strictEqual(typeof sim.stats.maxPopulationCapacity, 'number', 'Simulation stats has maxPopulationCapacity');

  const tm = new TrafficManager({ grid });
  tm.updateDensity(sim, grid);
  // Zero population -> 0 cars
  assert.strictEqual(tm.cars.length, 0, 'Zero population city has 0 traffic cars');
}

console.log('TrafficManager tests passed.');
