import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { CoverageManager } from '../src/engine/CoverageManager.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

function flatGrid() {
  const grid = new Grid(30, 30, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

{
  const grid = flatGrid();
  const station = grid.placeProducer(10, 10, PRODUCER_TYPE.POLICE_STATION, 0);
  station.filledJobs = 1;
  const coverage = CoverageManager.getCoverageSet(grid, 'police');

  assert.ok(coverage.has('10,10'), 'Direct coverage should include the building tile');
  assert.ok(coverage.has('15,10'), 'One staffed officer should provide five tiles of direct coverage');
  assert.ok(!coverage.has('16,10'), 'Direct coverage should stop at the base radius');
}

{
  const grid = flatGrid();
  const station = grid.placeProducer(10, 10, PRODUCER_TYPE.FIRE_STATION, 0);
  station.filledJobs = 1;
  for (let x = 11; x <= 22; x++) grid.placeRoad(x, 10);

  const firstCoverage = CoverageManager.getCoverageSet(grid, 'fire');
  assert.ok(firstCoverage.has('20,10'), 'Coverage should extend ten road tiles from the building');
  assert.ok(!firstCoverage.has('21,14'), 'Coverage should stop beyond the road length and side width');
  assert.ok(firstCoverage.has('20,13'), 'Coverage should extend three tiles beside the covered road');
  assert.strictEqual(
    firstCoverage,
    CoverageManager.getCoverageSet(grid, 'fire'),
    'Unchanged coverage inputs should reuse the cached set',
  );

  station.filledJobs = 2;
  const expandedCoverage = CoverageManager.getCoverageSet(grid, 'fire');
  assert.ok(expandedCoverage.has('21,14'), 'An additional staff member should increase road length and side width by one');
  assert.ok(expandedCoverage.has('21,14'), 'An additional staff member should increase road-side width by one');
}

{
  const grid = flatGrid();
  const hospital = grid.placeProducer(5, 5, PRODUCER_TYPE.HOSPITAL, 0);
  const clinic = grid.placeProducer(20, 20, PRODUCER_TYPE.CLINIC, 0);
  hospital.filledJobs = 1;
  clinic.filledJobs = 1;
  const coverage = CoverageManager.getCoverageSet(grid, 'medical');
  assert.ok(coverage.has('5,5'), 'Medical coverage should include hospital coverage');
  assert.ok(coverage.has('20,20'), 'Medical coverage should include clinic coverage');
  assert.strictEqual(new Set(coverage).size, coverage.size, 'Merged medical coverage should contain no duplicates');
}

console.log('Emergency coverage tests passed.');