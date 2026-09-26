import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import {
  applyHudSnapshot,
  buildHudSnapshot,
  buildInspectorSignature,
  changedHudFields,
  getHudCadenceMs,
  shouldRefreshUi,
} from '../src/engine/UiRefresh.js';
import { RENDERER_CONFIG, TERRAIN, ZONE } from '../src/config.js';

function flatten(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

function fakeDocument() {
  const els = {};
  return {
    els,
    getElementById(id) {
      if (!els[id]) els[id] = { textContent: '', style: { width: '', backgroundColor: '' } };
      return els[id];
    },
  };
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const simulation = new Simulation(grid);
  simulation.computeStats();
  const first = buildHudSnapshot(simulation, 25000);
  const second = buildHudSnapshot(simulation, 25000);
  assert.deepStrictEqual(second, first, 'Unchanged stats should produce an identical HUD snapshot');
  assert.deepStrictEqual(changedHudFields(first, second), [], 'Unchanged snapshots should report no dirty HUD fields');

  simulation.tickCount = 4;
  const afterTick = buildHudSnapshot(simulation, 25000);
  const changed = changedHudFields(first, afterTick);
  assert.ok(changed.includes('stat-tick'), 'Tick advances should dirty the tick display');
  assert.ok(changed.includes('stat-time'), 'Tick advances should dirty the clock display');
  assert.ok(!changed.includes('stat-pop'), 'A stable empty map should not dirty population');
  assert.ok(!changed.includes('meter-power-text'), 'A stable empty map should not dirty utility meters');

  const cashChanged = buildHudSnapshot(simulation, 24000);
  assert.ok(changedHudFields(afterTick, cashChanged).includes('stat-cash'), 'Treasury changes should dirty the cash display');
}

{
  const writes = [];
  const doc = fakeDocument();
  const snapshot = {
    'stat-pop': '12',
    'stat-cash': '$1,000',
    'meter-power-text': '1.00 / 2.00',
    'meter-power-fill': '50%|',
  };
  applyHudSnapshot(snapshot, Object.keys(snapshot), doc);
  assert.strictEqual(doc.els['stat-pop'].textContent, '12');
  assert.strictEqual(doc.els['meter-power-fill'].style.width, '50%');

  const next = { ...snapshot, 'stat-pop': '13', 'meter-power-fill': '75%|#ef4444' };
  applyHudSnapshot(next, changedHudFields(snapshot, next), doc);
  assert.strictEqual(doc.els['stat-pop'].textContent, '13');
  assert.strictEqual(doc.els['stat-cash'].textContent, '$1,000');
  assert.strictEqual(doc.els['meter-power-fill'].style.width, '75%');
  assert.strictEqual(doc.els['meter-power-fill'].style.backgroundColor, '#ef4444');
  writes.push(changedHudFields(snapshot, next));
  assert.deepStrictEqual(writes[0].sort(), ['meter-power-fill', 'stat-pop']);
}

{
  assert.strictEqual(getHudCadenceMs(false), 0, 'Desktop HUD cadence should be unbounded');
  assert.strictEqual(getHudCadenceMs(true), RENDERER_CONFIG.HUD_MOBILE_CADENCE_MS, 'Mobile HUD cadence should use the renderer bound');

  assert.strictEqual(shouldRefreshUi({ force: true, fieldCount: 0, now: 0, lastAppliedAt: 0, cadenceMs: 500 }), true, 'Forced HUD updates should apply immediately');
  assert.strictEqual(shouldRefreshUi({ fieldCount: 0, now: 1000, lastAppliedAt: 0, cadenceMs: 0 }), false, 'Unchanged HUD fields should skip DOM work');
  assert.strictEqual(shouldRefreshUi({ fieldCount: 2, now: 400, lastAppliedAt: 0, cadenceMs: 500 }), false, 'Mobile cadence should defer HUD DOM work');
  assert.strictEqual(shouldRefreshUi({ fieldCount: 2, now: 500, lastAppliedAt: 0, cadenceMs: 500 }), true, 'HUD DOM work should resume once the cadence elapses');
  assert.strictEqual(shouldRefreshUi({ fieldCount: 2, now: 100, lastAppliedAt: null, cadenceMs: 500 }), true, 'The first HUD apply should not wait for cadence');
}

{
  let tickCount = 0;
  let lastAppliedAt = null;
  let hudApplies = 0;
  for (let i = 0; i < 5; i++) {
    tickCount += 1;
    const now = i * 400;
    if (shouldRefreshUi({ fieldCount: 1, now, lastAppliedAt, cadenceMs: 500 })) {
      lastAppliedAt = now;
      hudApplies += 1;
    }
  }
  assert.strictEqual(tickCount, 5, 'Cadence must never skip simulation ticks');
  assert.ok(hudApplies < 5, 'A 500ms mobile cadence should skip some HUD applies at 5x');
  assert.ok(hudApplies >= 2, 'Cadence should still apply HUD updates across a 5-tick 5x run');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.placeRoad(2, 3);
  grid.placeZone(2, 2, ZONE.RESIDENTIAL);
  const simulation = new Simulation(grid);
  simulation.tick();
  const tile = grid.getTile(2, 2);
  const first = buildInspectorSignature(grid, tile);
  const second = buildInspectorSignature(grid, tile);
  assert.strictEqual(second, first, 'Inspector signature should be stable when the selected tile has not changed');
  tile.population = (tile.population || 0) + 4;
  assert.notStrictEqual(buildInspectorSignature(grid, tile), first, 'Population changes should refresh the inspector signature');
}

{
  const grid = new Grid(8, 8, 1);
  const simulation = new Simulation(grid);
  simulation.computeStats();

  simulation.tickCount = 0;
  assert.strictEqual(buildHudSnapshot(simulation, 25000)['stat-day'], 'Day 1', 'Tick 0 should be Day 1');

  simulation.tickCount = 23;
  assert.strictEqual(buildHudSnapshot(simulation, 25000)['stat-day'], 'Day 1', 'Tick 23 (hour 23) should still be Day 1');

  simulation.tickCount = 24;
  assert.strictEqual(buildHudSnapshot(simulation, 25000)['stat-day'], 'Day 2', 'Tick 24 (hour 24 / after 24 hrs) should be Day 2');

  simulation.tickCount = 48;
  assert.strictEqual(buildHudSnapshot(simulation, 25000)['stat-day'], 'Day 3', 'Tick 48 (after 48 hrs) should be Day 3');
}

console.log('HUD update tests passed.');
