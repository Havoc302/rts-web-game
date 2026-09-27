import assert from 'assert';
import { readFileSync } from 'fs';
import { Grid, producerTypeForTool } from '../src/engine/Grid.js';
import { PRODUCER_TYPE, TERRAIN } from '../src/config.js';

console.log('=== placement-rules.test.js ===');

const grid = new Grid(10, 10, 1);
for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
grid.getTile(0, 4).terrain = TERRAIN.WATER;

assert.strictEqual(producerTypeForTool('producer_water'), PRODUCER_TYPE.WATER_TOWER);
assert.strictEqual(producerTypeForTool('producer_sewage'), PRODUCER_TYPE.SEWAGE_PLANT);
assert.strictEqual(producerTypeForTool('producer_coal_plant'), PRODUCER_TYPE.COAL_PLANT);
assert.strictEqual(producerTypeForTool('road'), null);

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const [, tool] of html.matchAll(/data-tool="(producer_[a-z_]+)"/g)) {
  assert.ok(producerTypeForTool(tool), `Toolbar tool ${tool} should map to a producer type`);
}

// Roads need no road neighbour, otherwise the first road could never be placed.
assert.strictEqual(grid.canBuildTool(5, 5, 'road'), true);

// Every non-renewable building needs road access.
assert.strictEqual(grid.canBuildTool(3, 3, 'producer_battery'), false, 'Battery without a road is invalid');
assert.strictEqual(grid.canBuildTool(3, 3, 'producer_school'), false, 'Services without a road are invalid');
assert.strictEqual(grid.canBuildTool(3, 3, 'zone_r'), false, 'Zones without a road are invalid');
grid.placeRoad(3, 2);
assert.strictEqual(grid.canBuildTool(3, 3, 'producer_battery'), true);
assert.strictEqual(grid.canBuildTool(3, 3, 'zone_r'), true);

// Water pumps and sewage plants need both water and a road.
assert.strictEqual(grid.canBuildTool(1, 4, 'producer_water'), false, 'Water pump next to water but no road is invalid');
grid.placeRoad(1, 3);
assert.strictEqual(grid.canBuildTool(1, 4, 'producer_water'), true);
assert.strictEqual(grid.canBuildTool(1, 4, 'producer_sewage'), true);
assert.strictEqual(grid.canBuildTool(3, 1, 'producer_water'), false, 'Water pump next to a road but no water is invalid');

// Windmills and solar panels only need an adjacent battery, not a road.
assert.strictEqual(grid.canBuildTool(8, 8, 'producer_windmill'), false, 'Windmill without a battery is invalid');
grid.placeProducer(3, 3, PRODUCER_TYPE.BATTERY, 400);
assert.strictEqual(grid.canBuildTool(4, 4, 'producer_windmill'), true, 'Diagonal battery is enough for a windmill');
assert.strictEqual(grid.canBuildTool(4, 4, 'producer_solar_panel'), true, 'Diagonal battery is enough for a solar panel');

// Surveys follow canSurvey (no water tiles).
assert.strictEqual(grid.canBuildTool(0, 4, 'survey'), false);
assert.strictEqual(grid.canBuildTool(6, 6, 'survey'), true);

assert.strictEqual(grid.canBuildTool(6, 6, null), false);

console.log('Placement rule tests passed.');
