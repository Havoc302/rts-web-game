import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import { CoverageManager } from '../../src/engine/CoverageManager.js';
import { PRODUCER_TYPE, TERRAIN } from '../../src/config.js';

function flatGrid(size = 40) {
  const grid = new Grid(size, size, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.POLICE_STATION, 0);
  for (let x = 8; x <= 32; x++) grid.placeRoad(x, 16);
  station.filledJobs = 1;
  const coverage = CoverageManager.getCoverageSet(grid, 'police');

  assert.ok(coverage.has('15,15'), 'Direct coverage should include the building tile');
  assert.ok(coverage.has('18,16'), 'One staffed officer should cover three road blocks');
  assert.ok(!coverage.has('19,17'), 'Coverage should stop after three road blocks and one side block');
  assert.ok(coverage.has('18,17'), 'One staffed officer should cover one side block');
  assert.ok(!coverage.has('18,18'), 'Coverage should stop after one side block');

  const near = CoverageManager.getCoverageSource(grid, 'police', 16, 16);
  const far = CoverageManager.getCoverageSource(grid, 'police', 18, 16);
  assert.ok(near && far, 'Covered tiles should record their responding station');
  assert.strictEqual(near.stationId, station.id);
  assert.ok(far.distance > near.distance, 'Distance should grow away from the station');
  assert.strictEqual(far.maxDistance, 4, 'Tier 1 with one staff covers four blocks at its edge');
}

{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.FIRE_STATION, 0);
  station.filledJobs = 1;
  for (let x = 8; x <= 32; x++) grid.placeRoad(x, 16);

  const firstCoverage = CoverageManager.getCoverageSet(grid, 'fire');
  assert.ok(firstCoverage.has('18,16'), 'One firefighter should reach three road blocks');
  assert.ok(!firstCoverage.has('19,17'), 'Coverage should stop after three road blocks and one side block');
  assert.ok(firstCoverage.has('18,17'), 'One firefighter should cover one block beside the road');
  assert.strictEqual(
    firstCoverage,
    CoverageManager.getCoverageSet(grid, 'fire'),
    'Unchanged coverage inputs should reuse the cached set',
  );

  station.filledJobs = 5;
  const expandedCoverage = CoverageManager.getCoverageSet(grid, 'fire');
  assert.ok(expandedCoverage.has('22,16'), 'Five firefighters should reach seven road blocks');
  assert.ok(expandedCoverage.has('22,21'), 'Five firefighters should cover five side blocks');
  assert.ok(!expandedCoverage.has('22,22'), 'Coverage should stop after five side blocks');
}

{
  const grid = flatGrid();
  const station = grid.placeProducer(15, 15, PRODUCER_TYPE.POLICE_STATION, 0);
  for (let x = 8; x <= 32; x++) grid.placeRoad(x, 16);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(15, 15)), true);
  station.filledJobs = 1;

  const coverage = CoverageManager.getCoverageSet(grid, 'police');
  assert.ok(coverage.has('21,16'), 'Tier 2 with one staff should reach six road blocks');
  assert.ok(!coverage.has('24,16'), 'Tier 2 should stop after six road blocks plus two side blocks');
  assert.ok(coverage.has('21,18'), 'Tier 2 should cover two side blocks');
  assert.ok(!coverage.has('21,19'), 'Tier 2 should stop after two side blocks');
}

{
  const grid = flatGrid();
  const hospital = grid.placeProducer(5, 5, PRODUCER_TYPE.HOSPITAL, 0);
  hospital.filledJobs = 1;
  const coverage = CoverageManager.getCoverageSet(grid, 'medical');
  assert.ok(coverage.has('5,5'), 'Medical coverage should include the hospital tile');
  assert.strictEqual(new Set(coverage).size, coverage.size, 'Medical coverage should contain no duplicates');
}

console.log('Emergency coverage tests passed.');