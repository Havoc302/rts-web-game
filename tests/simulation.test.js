import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { UtilityManager } from '../src/engine/UtilityManager.js';
import { PollutionManager } from '../src/engine/PollutionManager.js';
import { FireManager } from '../src/engine/FireManager.js';
import { PRODUCER_TYPE, ZONE, DENSITY, GROWTH_CONFIG, MAP_WIDTH, MAP_HEIGHT, TERRAIN_TYPE, CRIME_CONFIG, MEDICAL_CONFIG } from '../src/config.js';

console.log('Running Phase 1 Core Loop Automated Verification Tests...\n');

// Test 1: Road Network & BFS Utility Distance
{
  const grid = new Grid(10, 10);
  // Clear mountains/water for test simplicity
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      grid.tiles[y][x].terrain = 'flat';
    }
  }

  // Producer at (1, 1)
  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);

  // Roads: (1, 2) -> (2, 2) -> (3, 2) -> (4, 2)
  grid.placeRoad(1, 2);
  grid.placeRoad(2, 2);
  grid.placeRoad(3, 2);
  grid.placeRoad(4, 2);

  // Zone at (4, 3) (adjacent to road at 4, 2)
  grid.placeZone(4, 3, ZONE.RESIDENTIAL);

  UtilityManager.allocateAll(grid);

  const tile = grid.getTile(4, 3);
  assert.strictEqual(tile.shortfall.power, false, 'Tile should be serviced by power');
  assert.strictEqual(tile.distanceToProducer.power, 4, 'Distance along road to producer connection point should be 4');
  console.log('✔ Test 1 Passed: Road Network BFS & distance computation correct');
}

// Test 1b: Windmills transmit through adjacent batteries without road access
{
  const grid = new Grid(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      grid.tiles[y][x].terrain = 'flat';
    }
  }

  const windmill = grid.placeProducer(2, 2, PRODUCER_TYPE.WINDMILL, 40);
  const battery = grid.placeProducer(3, 2, PRODUCER_TYPE.BATTERY, 400);
  grid.placeRoad(3, 3);

  UtilityManager.allocateAll(grid);

  assert.strictEqual(windmill.hasBatteryConnection, true, 'Windmill should use adjacent battery transmission');
  assert.ok(windmill.capacity > 0, 'Windmill should generate power without adjacent road access');
  assert.ok(battery.storedEnergy > 0, 'Road-connected battery should receive surplus wind power');
  console.log('✔ Test 1b Passed: Windmills use batteries instead of road access');
}

// Test 1c: Fire destroys a windmill at the configured damage threshold
{
  const grid = new Grid(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      grid.tiles[y][x].terrain = 'flat';
    }
  }

  const windmill = grid.placeProducer(2, 2, PRODUCER_TYPE.WINDMILL, 40);
  const tile = grid.getTile(2, 2);
  tile.onFire = true;
  tile.fireDamage = 90;

  FireManager.updateFires(grid, { fireInjuries: 0 });

  assert.strictEqual(tile.producer, null, 'A windmill at maximum fire damage should be destroyed');
  assert.strictEqual(grid.producers.includes(windmill), false, 'Destroyed windmill should leave the producer list');
  assert.strictEqual(tile.destroyed, true, 'Destroyed tile should remain marked as destroyed');
  console.log('✔ Test 1c Passed: Fire destroys windmills at maximum damage');
}

// Test 2: Nearest-served-first allocation (Power / Water)
{
  const grid = new Grid(15, 15);
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      grid.tiles[y][x].terrain = 'flat';
    }
  }

  // Plant with low capacity (2 units)
  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 2);

  // Road line (1, 2) to (1, 10)
  for (let y = 2; y <= 10; y++) grid.placeRoad(1, y);

  // Near zone at (2, 2) (usage = 1)
  grid.placeZone(2, 2, ZONE.RESIDENTIAL);

  // Middle zone at (2, 4) (usage = 1)
  grid.placeZone(2, 4, ZONE.RESIDENTIAL);

  // Far zone at (2, 8) (usage = 1)
  grid.placeZone(2, 8, ZONE.RESIDENTIAL);

  UtilityManager.allocateAll(grid);

  const nearTile = grid.getTile(2, 2);
  const midTile = grid.getTile(2, 4);
  const farTile = grid.getTile(2, 8);

  assert.strictEqual(nearTile.shortfall.power, false, 'Near tile should receive power');
  assert.strictEqual(midTile.shortfall.power, false, 'Middle tile should receive power');
  assert.strictEqual(farTile.shortfall.power, true, 'Far tile should suffer power shortfall due to capacity exhaustion');
  console.log('✔ Test 2 Passed: Power allocation nearest-served-first & shortfall flag correct');
}

// Test 3: Nearest-backs-up-first allocation (Sewage - farthest processed first)
{
  const grid = new Grid(15, 15);
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      grid.tiles[y][x].terrain = 'flat';
    }
  }

  // Water for sewage plant placement
  grid.tiles[1][0].terrain = 'water';

  // Sewage plant at (1, 1) with capacity 4 (each Res Light consumes 2 sewage)
  // Capacity 4 can service exactly 2 tiles!
  grid.placeProducer(1, 1, PRODUCER_TYPE.SEWAGE_PLANT, 4);

  for (let y = 2; y <= 10; y++) grid.placeRoad(1, y);

  // Near zone at (2, 2)
  grid.placeZone(2, 2, ZONE.RESIDENTIAL);

  // Mid zone at (2, 5)
  grid.placeZone(2, 5, ZONE.RESIDENTIAL);

  // Far zone at (2, 9)
  grid.placeZone(2, 9, ZONE.RESIDENTIAL);

  UtilityManager.allocateAll(grid);

  const nearTile = grid.getTile(2, 2);
  const midTile = grid.getTile(2, 5);
  const farTile = grid.getTile(2, 9);

  // In Sewage (farthest first): farTile (dist 9) processed 1st (2 cap used), midTile (dist 5) processed 2nd (2 cap used).
  // Total used = 4. Plant capacity reached!
  // nearTile (dist 2) processed 3rd -> capacity empty -> sewage backs up at nearTile!
  assert.strictEqual(farTile.shortfall.sewage, false, 'Farthest tile should be serviced first for sewage');
  assert.strictEqual(midTile.shortfall.sewage, false, 'Middle tile should be serviced second for sewage');
  assert.strictEqual(nearTile.shortfall.sewage, true, 'Nearest tile should suffer sewage shortfall (sewage backs up near plant)');
  console.log('✔ Test 3 Passed: Sewage allocation nearest-backs-up-first correct');
}

// Test 4: Simulation Tick & Growth / Density Progression
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  // Water for producers
  grid.tiles[3][0].terrain = 'water';
  grid.tiles[5][0].terrain = 'water';

  const sim = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);

  grid.placeRoad(2, 1);
  grid.placeRoad(2, 2);
  grid.placeRoad(2, 3);
  grid.placeRoad(2, 4);
  grid.placeRoad(2, 5);

  grid.placeZone(3, 3, ZONE.RESIDENTIAL);
  grid.placeZone(3, 4, ZONE.COMMERCIAL);
  const cTile = grid.getTile(3, 4);
  cTile.growthScore = 30;
  cTile.density = DENSITY.HIGH; // 40 jobs provided, 0 pollution -> jobsAvailable stays > 0

  const zTile = grid.getTile(3, 3);
  assert.strictEqual(zTile.density, DENSITY.LIGHT);
  assert.strictEqual(zTile.growthScore, 0);

  // Crime spawning is probabilistic; disable it so growth math stays deterministic here.
  const originalRandom = Math.random;
  const originalBaseCrimeChance = CRIME_CONFIG.BASE_CRIME_CHANCE;
  const originalUnemploymentScaler = CRIME_CONFIG.JOB_SCARCITY_CRIME_SCALER;
  const originalUnhealthyPenalty = MEDICAL_CONFIG.UNHEALTHY_GROWTH_PENALTY;
  Math.random = () => 0.999;
  CRIME_CONFIG.BASE_CRIME_CHANCE = 0;
  CRIME_CONFIG.JOB_SCARCITY_CRIME_SCALER = 0;
  // No hospital built in this test; disable the unrelated health penalty so growth math stays deterministic.
  MEDICAL_CONFIG.UNHEALTHY_GROWTH_PENALTY = 0;

  // Run simulation ticks up to THRESHOLD_MEDIUM
  for (let i = 0; i < GROWTH_CONFIG.THRESHOLD_MEDIUM; i++) {
    sim.tick();
  }

  assert.strictEqual(zTile.density, DENSITY.MEDIUM, 'Tile should upgrade to MEDIUM density at threshold');
  assert.strictEqual(zTile.growthScore, GROWTH_CONFIG.THRESHOLD_MEDIUM);

  // Run simulation ticks up to THRESHOLD_HIGH
  for (let i = 0; i < GROWTH_CONFIG.THRESHOLD_HIGH - GROWTH_CONFIG.THRESHOLD_MEDIUM; i++) {
    sim.tick();
  }

  Math.random = originalRandom;
  CRIME_CONFIG.BASE_CRIME_CHANCE = originalBaseCrimeChance;
  CRIME_CONFIG.JOB_SCARCITY_CRIME_SCALER = originalUnemploymentScaler;

  assert.strictEqual(zTile.density, DENSITY.HIGH, 'Tile should upgrade to HIGH density at threshold');
  zTile.growthScore = GROWTH_CONFIG.MAX_SCORE + 10;
  sim.updateGrowthAndDensity();
  assert.strictEqual(zTile.growthScore, GROWTH_CONFIG.MAX_SCORE, 'Growth score should cap at full population');
  MEDICAL_CONFIG.UNHEALTHY_GROWTH_PENALTY = originalUnhealthyPenalty;
  console.log('✔ Test 4 Passed: Growth score & density progression correct');
}

// Test 5: Tax Income Calculation & Tax Rate Slider
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  const sim = new Simulation(grid);

  grid.placeRoad(2, 2);
  grid.placeZone(3, 2, ZONE.RESIDENTIAL); // Light = $1
  grid.placeZone(2, 3, ZONE.COMMERCIAL);  // Light = $2
  grid.placeZone(1, 2, ZONE.INDUSTRIAL);  // Light = $2

  // Force Industrial to High density
  const resTile = grid.getTile(3, 2);
  resTile.growthScore = GROWTH_CONFIG.MAX_SCORE;
  const indTile = grid.getTile(1, 2);
  indTile.growthScore = 30;
  indTile.density = DENSITY.HIGH; // High Industrial = $6

  // Income is based on residents and employed workers, not zone density.
  sim.taxRate = 100;
  sim.computeStats();
  let income = sim.stats.incomePerTick;
  assert.strictEqual(income, 5, 'Income at 100% tax should reflect scaled resident and worker revenue');

  // Change tax rate to 50%
  sim.taxRate = 50;
  sim.computeStats();
  income = sim.stats.incomePerTick;
  assert.strictEqual(income, 3, 'Income at 50% tax should round half of the scaled population-based income');
  console.log('✔ Test 5 Passed: Tax income calculations per zone/density & tax rate multiplier correct');
}

// Test 6: Industrial Zone Pollution Radius & Emission
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  const indTile = grid.getTile(5, 5);
  indTile.zone = ZONE.INDUSTRIAL;
  indTile.density = DENSITY.HIGH; // Radius = 7, Emission = 10

  PollutionManager.computePollution(grid);

  assert.strictEqual(grid.getTile(5, 5).pollution, 10, 'Source center should have full emission');
  assert.strictEqual(grid.getTile(5, 6).pollution, 9, 'Distance 1 should have emission - 1');
  assert.strictEqual(grid.getTile(5, 7).pollution, 8, 'Distance 2 should have emission - 2');
  console.log('✔ Test 6 Passed: Industrial pollution radius & Manhattan falloff correct');
}

// Test 7: Sewage Backup Emission from Shortfall Tile
{
  const grid = new Grid(15, 15);
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) grid.tiles[y][x].terrain = 'flat';
  }

  grid.tiles[1][0].terrain = 'water';

  // Plant with cap 0 so all sewage backs up
  grid.placeProducer(1, 1, PRODUCER_TYPE.SEWAGE_PLANT, 0);
  grid.placeRoad(1, 2);
  grid.placeZone(2, 2, ZONE.RESIDENTIAL);

  const sim = new Simulation(grid);
  sim.tick();

  const backedUpTile = grid.getTile(2, 2);
  assert.strictEqual(backedUpTile.shortfall.sewage, true, 'Tile should have sewage shortfall');
  assert.ok(backedUpTile.pollution >= 6, 'Backed up sewage tile should emit pollution from its position');
  console.log('✔ Test 7 Passed: Sewage backup emits pollution from shortfall tile position');
}

// Test 8: Downstream River Contamination of Water Towers
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  // Water column at x=5
  for (let y = 0; y < 10; y++) {
    grid.tiles[y][5].terrain = 'water';
    grid.tiles[y][5].riverFlowDir = { x: 0, y: 1 };
  }

  // Sewage plant at (4, 2), flowing downstream (increasing y)
  const sewagePlant = grid.placeProducer(4, 2, PRODUCER_TYPE.SEWAGE_PLANT, 100);

  // Upstream water tower at (4, 0)
  const upstreamTower = grid.placeProducer(4, 0, PRODUCER_TYPE.WATER_TOWER, 100);

  // Downstream water tower at (4, 6)
  const downstreamTower = grid.placeProducer(4, 6, PRODUCER_TYPE.WATER_TOWER, 100);

  const sim = new Simulation(grid);
  sim.tick();
  sewagePlant.usedCapacity = 100;
  PollutionManager.computePollution(grid);

  assert.strictEqual(upstreamTower.contaminated, false, 'Upstream water tower should NOT be contaminated');
  assert.strictEqual(downstreamTower.contaminated, true, 'Downstream water tower SHOULD be contaminated');
  assert.ok(grid.getTile(4, 6).pollution >= 15, 'Contaminated tower emits pollution around itself');
  console.log('✔ Test 8 Passed: River discharge contaminates downstream towers only');
}

// Test 9: Pollution Growth Penalty & Industrial Immunity
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  grid.tiles[3][0].terrain = 'water';
  grid.tiles[5][0].terrain = 'water';

  const sim = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

  grid.placeZone(3, 2, ZONE.RESIDENTIAL);
  grid.placeZone(3, 4, ZONE.INDUSTRIAL);

  const resTile = grid.getTile(3, 2);
  const indTile = grid.getTile(3, 4);
  const laborTile = grid.getTile(4, 2);
  laborTile.zone = ZONE.RESIDENTIAL;
  laborTile.density = DENSITY.HIGH;
  laborTile.growthScore = GROWTH_CONFIG.MAX_SCORE;

  // Inject high pollution to both
  resTile.pollution = 10;
  indTile.pollution = 10;

  // Serviced delta (+1) + pollution penalty (-1) = 0 growth for Res
  // Serviced delta (+1) + immune to penalty = +1 growth for Ind
  sim.computeStats();
  sim.updateGrowthAndDensity();

  assert.strictEqual(resTile.growthScore, 0, 'Residential tile growth is stalled by pollution penalty');
  assert.ok(indTile.growthScore >= 1, 'Industrial tile growth is immune to pollution penalty');
  console.log('✔ Test 9 Passed: Pollution growth penalty applies to R/C but Industrial is immune');
}

// Test 10: Water-Adjacent Placement Rules
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  // Water at (5, 5)
  grid.tiles[5][5].terrain = 'water';

  // Can place power plant anywhere flat
  assert.strictEqual(grid.canPlaceProducer(1, 1, PRODUCER_TYPE.POWER_PLANT), true);

  // Cannot place water tower away from water
  assert.strictEqual(grid.canPlaceProducer(1, 1, PRODUCER_TYPE.WATER_TOWER), false);

  // Can place water tower adjacent to (5, 5)
  assert.strictEqual(grid.canPlaceProducer(5, 4, PRODUCER_TYPE.WATER_TOWER), true);

  // Cannot place sewage plant away from water
  assert.strictEqual(grid.canPlaceProducer(1, 1, PRODUCER_TYPE.SEWAGE_PLANT), false);

  // Can place sewage plant adjacent to (5, 5)
  assert.strictEqual(grid.canPlaceProducer(4, 5, PRODUCER_TYPE.SEWAGE_PLANT), true);

  console.log('✔ Test 10 Passed: Water-adjacent producer placement rules enforced');
}

// Test 11: City-Wide Labor Market Aggregates
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  const sim = new Simulation(grid);

  // 1 Commercial Light = 30 jobs, 1 Industrial Medium = 200 jobs -> total 230 jobs
  const cTile = grid.getTile(1, 1);
  cTile.zone = ZONE.COMMERCIAL;
  cTile.density = DENSITY.LIGHT;

  const iTile = grid.getTile(1, 2);
  iTile.zone = ZONE.INDUSTRIAL;
  iTile.density = DENSITY.MEDIUM;

  // 1 Res Light starts at 0 population until growthScore rises above 0
  const rTile = grid.getTile(1, 3);
  rTile.zone = ZONE.RESIDENTIAL;
  rTile.density = DENSITY.LIGHT;

  sim.computeStats();

  assert.strictEqual(sim.stats.totalJobsProvided, 230, 'Total jobs provided should be 230');
  assert.strictEqual(sim.stats.totalEmployablePopulation, 0, 'Total employable pop should start at 0');
  assert.strictEqual(sim.stats.jobsFilled, 0, 'Jobs filled should be min(230, 0) = 0');
  assert.strictEqual(sim.stats.jobsAvailable, 230, 'Jobs available should be 230 - 0 = 230');
  assert.strictEqual(sim.stats.employmentRate, 0, 'Employment rate should be 0 with no population yet');
  console.log('✔ Test 11 Passed: City-wide labor market aggregates correct');
}

// Test 12: Residential Growth Stalling When No Jobs Available
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  grid.tiles[3][0].terrain = 'water';
  grid.tiles[5][0].terrain = 'water';

  const sim = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

  grid.placeZone(3, 2, ZONE.RESIDENTIAL);
  const rTile = grid.getTile(3, 2);

  // No C or I zones built -> totalJobsProvided = 0, jobsAvailable = 0
  sim.tick();

  assert.strictEqual(sim.stats.jobsAvailable, 0, 'No jobs available');
  assert.strictEqual(rTile.growthScore, 0, 'Residential growth stalls at 0 when jobsAvailable is 0');
  console.log('✔ Test 12 Passed: Residential growth stalls when jobsAvailable === 0');
}

// Test 13: Commercial / Industrial Growth Employment Rate Bonus
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  grid.tiles[3][0].terrain = 'water';
  grid.tiles[5][0].terrain = 'water';

  const sim = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

  // 1 Commercial Light = 5 jobs, 1 Res Light = 5 employable -> employmentRate = 1.0 (100%)
  grid.placeZone(3, 2, ZONE.COMMERCIAL);
  grid.placeZone(3, 3, ZONE.RESIDENTIAL);
  const laborTile = grid.getTile(3, 3);
  laborTile.density = DENSITY.HIGH;
  laborTile.growthScore = GROWTH_CONFIG.MAX_SCORE;

  sim.tick();

  const cTile = grid.getTile(3, 2);
  assert.strictEqual(sim.stats.employmentRate, 1.0, 'Employment rate is 100%');
  assert.ok(cTile.growthScore >= 2, 'Commercial gets employment rate bonus delta (+1 serviced +1 emp bonus)');
  console.log('✔ Test 13 Passed: Commercial/Industrial receives growth bonus from employment rate');
}

// Test 14: Tax Rate Growth Penalty Across All Zones (R, C, I)
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }

  grid.tiles[3][0].terrain = 'water';
  grid.tiles[5][0].terrain = 'water';

  const sim = new Simulation(grid);

  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, 100);
  grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100);
  grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100);
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);

  grid.placeZone(3, 2, ZONE.RESIDENTIAL);
  grid.placeZone(3, 3, ZONE.COMMERCIAL);
  grid.placeZone(3, 4, ZONE.INDUSTRIAL);
  const laborTile = grid.getTile(3, 2);
  laborTile.density = DENSITY.HIGH;
  laborTile.growthScore = GROWTH_CONFIG.MAX_SCORE;

  // At 0% tax, delta = +1 (serviced) -> growthScore becomes 1
  sim.taxRate = 0;
  sim.tick();
  const cTileAt100 = grid.getTile(3, 3).growthScore;
  const iTileAt100 = grid.getTile(3, 4).growthScore;

  assert.strictEqual(cTileAt100, 2, 'Commercial grows by serviced growth plus employment bonus at 0% tax');
  assert.strictEqual(iTileAt100, 2, 'Industrial grows by serviced growth plus employment bonus at 0% tax');

  // Reset tile growthScores and set tax rate to 100% (strong population outflow)
  grid.getTile(3, 3).growthScore = 0;
  grid.getTile(3, 4).growthScore = 0;
  sim.taxRate = 100;
  sim.tick();

  const cTileAt150 = grid.getTile(3, 3).growthScore;
  const iTileAt150 = grid.getTile(3, 4).growthScore;

  assert.strictEqual(cTileAt150, 0, 'Commercial growth should reverse at the 100% tax rate');
  assert.strictEqual(iTileAt150, 0, 'Industrial growth should reverse at the 100% tax rate');

  console.log('✔ Test 14 Passed: High tax rate reduces growth score across all zone types');
}

// Test 15: Disconnected Producer Capacity Exclusion
{
  const grid = new Grid(10, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) grid.tiles[y][x].terrain = 'flat';
  }
  grid.getTile(5, 0).terrain = 'water';

  const sim = new Simulation(grid);

  // Place sewage plant at (5, 1) (adjacent to water at 5, 0) without any road adjacent
  const prod = grid.placeProducer(5, 1, PRODUCER_TYPE.SEWAGE_PLANT, 120);
  assert.ok(prod, 'Producer placed successfully');

  sim.computeStats();
  assert.strictEqual(sim.stats.sewageCapacity, 0, 'Disconnected sewage plant should NOT add to city sewage capacity');

  // Now connect road at (5, 2) (adjacent to sewage plant at 5, 1)
  grid.placeRoad(5, 2);

  sim.computeStats();
  assert.strictEqual(sim.stats.sewageCapacity, 120, 'Road-connected sewage plant SHOULD add to city sewage capacity');

  console.log('✔ Test 15 Passed: Disconnected producers excluded from city utility capacity stats');
}

// Test 16: Dynamic Map Dimensions & TERRAIN_TYPE Dictionary
{
  const grid = new Grid(MAP_WIDTH, MAP_HEIGHT);
  assert.strictEqual(grid.width, MAP_WIDTH, 'Grid width should match MAP_WIDTH');
  assert.strictEqual(grid.height, MAP_HEIGHT, 'Grid height should match MAP_HEIGHT');
  assert.strictEqual(grid.tiles.length, MAP_HEIGHT, 'Grid should have MAP_HEIGHT rows');
  assert.strictEqual(grid.tiles[0].length, MAP_WIDTH, 'Grid should have MAP_WIDTH columns');

  assert.ok(TERRAIN_TYPE.EMPTY, 'TERRAIN_TYPE.EMPTY defined');
  assert.ok(TERRAIN_TYPE.RIVER, 'TERRAIN_TYPE.RIVER defined');
  assert.ok(TERRAIN_TYPE.ROCK, 'TERRAIN_TYPE.ROCK defined');
  assert.ok(TERRAIN_TYPE.FOREST, 'TERRAIN_TYPE.FOREST defined');

  console.log('✔ Test 16 Passed: Dynamic map dimensions & TERRAIN_TYPE dictionary correct');
}

// Test 17: Procedural Terrain Generation & Random Walk River
{
  const grid = new Grid(30, 30);
  grid.randomizeGrid();

  let hasRiver = false;
  let hasForest = false;
  let hasRock = false;
  let hasEmpty = false;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const terrain = grid.tiles[y][x].terrain;
      if (terrain === TERRAIN_TYPE.RIVER) hasRiver = true;
      if (terrain === TERRAIN_TYPE.FOREST) hasForest = true;
      if (terrain === TERRAIN_TYPE.ROCK) hasRock = true;
      if (terrain === TERRAIN_TYPE.EMPTY) hasEmpty = true;
    }
  }

  assert.ok(hasRiver, 'Procedural generator should create a random walk river');
  assert.ok(hasForest, 'Procedural generator should scatter forest clusters');
  assert.ok(hasRock, 'Procedural generator should scatter rock clusters');
  assert.ok(hasEmpty, 'Procedural generator should leave buildable empty terrain');

  console.log('✔ Test 17 Passed: Procedural terrain generator creates rivers, forests, rocks, and buildable ground');
}

// Test 18: Regenerate Grid Functionality
{
  const grid = new Grid(30, 30);
  grid.placeRoad(5, 5);
  grid.randomizeGrid();

  assert.strictEqual(grid.producers.length, 0, 'Regenerate map clears previous producers');
  assert.strictEqual(grid.tiles[5][5].hasRoad, false, 'Regenerate map clears previous roads');

  console.log('✔ Test 18 Passed: randomizeGrid() successfully resets grid and regenerates procedural map');
}

console.log('\nALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');





