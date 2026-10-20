import assert from 'assert';
import { FIRE_CONFIG, TERRAIN } from '../src/config.js';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';

console.log('=== fire-alert.test.js ===');

const flatten = (grid) => {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
};

const hasFireAlert = (simulation) => simulation.stats.alerts.some((alert) => alert.id.startsWith('fire:'));
const RADIUS = FIRE_CONFIG.ALERT_DEVELOPMENT_RADIUS;

assert.ok(RADIUS > 0, 'The alert radius must be configured');

// --- A remote wildfire with no player works nearby stays quiet --------------------------
{
  const grid = new Grid(60, 60, 1);
  flatten(grid);
  const sim = new Simulation(grid);
  const fire = grid.getTile(50, 50);
  fire.onFire = true;

  sim.computeStats();
  assert.strictEqual(hasFireAlert(sim), false, 'A wildfire far from any player tile should not alert');
}

// --- A road inside the radius raises the alert ------------------------------------------
{
  const grid = new Grid(60, 60, 1);
  flatten(grid);
  const sim = new Simulation(grid);
  const fire = grid.getTile(50, 50);
  fire.onFire = true;

  // Exactly at the radius (Chebyshev distance 20).
  assert.ok(grid.placeRoad(50 - RADIUS, 50));
  sim.computeStats();
  assert.strictEqual(hasFireAlert(sim), true, 'A fire within the alert radius of a road should alert');
  const alert = sim.stats.alerts.find((entry) => entry.id.startsWith('fire:'));
  assert.deepStrictEqual([alert.x, alert.y], [50, 50], 'The alert points at the burning tile');
}

// --- One tile beyond the radius is scenery ----------------------------------------------
{
  const grid = new Grid(60, 60, 1);
  flatten(grid);
  const sim = new Simulation(grid);
  const fire = grid.getTile(50, 50);
  fire.onFire = true;

  assert.ok(grid.placeRoad(50 - RADIUS - 1, 50));
  sim.computeStats();
  assert.strictEqual(hasFireAlert(sim), false, 'A road just beyond the radius should not alert');
}

// --- Zones and buildings count as player development too --------------------------------
{
  const grid = new Grid(60, 60, 1);
  flatten(grid);
  const sim = new Simulation(grid);
  const fire = grid.getTile(50, 50);
  fire.onFire = true;

  // A zone needs an adjacent road to exist. Bulldoze that road afterwards so only the zone
  // remains as player development near the fire.
  assert.ok(grid.placeRoad(38, 46));
  assert.ok(grid.placeZone(39, 46, 'residential'));
  assert.ok(grid.bulldoze(38, 46));
  assert.strictEqual(grid.hasPlayerDevelopmentWithin(50, 50, RADIUS), true, 'A zoned tile counts as development');
  sim.computeStats();
  assert.strictEqual(hasFireAlert(sim), true, 'A fire near a zoned block should alert');

  assert.strictEqual(grid.hasPlayerDevelopmentWithin(50, 50, 10), false, 'The zone is outside a 10-tile radius');
}

// --- Distance is measured as a square, matching the documented radius -------------------
{
  const grid = new Grid(60, 60, 1);
  flatten(grid);
  assert.ok(grid.placeRoad(30, 30));
  assert.strictEqual(grid.hasPlayerDevelopmentWithin(50, 50, 20), true, 'Corner distance of 20 is inside the box');
  assert.strictEqual(grid.hasPlayerDevelopmentWithin(50, 50, 19), false, 'Corner distance of 20 is outside a 19 box');
  assert.strictEqual(grid.hasPlayerDevelopmentWithin(0, 0, 20), false, 'Out-of-range centers clamp safely');
}

console.log('Fire alert proximity tests passed.');
