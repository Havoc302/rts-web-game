import assert from 'assert';
import { readFileSync } from 'node:fs';
import { Grid } from '../../src/engine/Grid.js';
import { Simulation } from '../../src/engine/Simulation.js';
import {
  applyHudSnapshot,
  buildHudSnapshot,
  buildInspectorSignature,
  changedHudFields,
  formatMoney,
  getHudCadenceMs,
  shouldRefreshUi,
  treasuryFlowSnapshot,
  weatherIcons,
} from '../../src/engine/UiRefresh.js';
import { RENDERER_CONFIG, TERRAIN, ZONE } from '../../src/config.js';

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

  // Money is always shown in whole dollars, even when the ledger carries cents.
  assert.strictEqual(formatMoney(24999.99), '$25,000');
  assert.strictEqual(formatMoney(-1234.56), '-$1,235');
  assert.strictEqual(buildHudSnapshot(simulation, 24999.99)['stat-cash'], '$25,000');

  simulation.weatherManager.cloudCover = 0.9;
  simulation.weatherManager.windIntensity = 0.95;
  const stormy = buildHudSnapshot(simulation, 24000);
  assert.ok(changedHudFields(cashChanged, stormy).includes('stat-weather'), 'Weather changes should dirty the weather icon');
  assert.ok(!changedHudFields(cashChanged, stormy).includes('stat-time'), 'Weather changes should not dirty the clock');
  assert.strictEqual(stormy['stat-weather'], '🌧️🌪️', 'Rain and gale should show rain and tornado icons');
  assert.strictEqual(stormy['stat-weather-wind'], '95%');
  assert.strictEqual(stormy['stat-weather-cloud'], '90%');
  assert.strictEqual(stormy['stat-weather-temp'], `${Math.round(simulation.weatherManager.temperature)}°C`);
  assert.strictEqual(stormy['stat-weather-label'], simulation.weatherManager.getWeatherLabel());
}

// Population hover: residents over total residential capacity; service chip folds in roads.
{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.placeRoad(1, 1);
  grid.placeZone(2, 1, ZONE.RESIDENTIAL);
  grid.placeZone(1, 2, ZONE.RESIDENTIAL);
  const simulation = new Simulation(grid);
  // Stats recompute per-block caps from density, so set the explicit caps afterwards.
  grid.getTile(2, 1).maxPopulation = 500;
  grid.getTile(1, 2).maxPopulation = 25;
  simulation.stats.population = 120;
  simulation.stats.serviceExpenses = 30;
  simulation.stats.roadExpenses = 12;
  const snapshot = buildHudSnapshot(simulation, 1000);
  assert.strictEqual(snapshot['stat-housing'], '120 / 525', 'Housing shows residents over every residential block cap');
  assert.strictEqual(snapshot['stat-service-expenses'], '-$42', 'Service chip includes road maintenance');
  assert.strictEqual(snapshot['stat-service-road'], '-$12', 'Service tooltip keeps the road cost separate');
  assert.strictEqual(snapshot['stat-road-expenses'], undefined, 'The standalone road readout is gone');
}

// Treasury hover: every per-tick inflow and outflow, then the net.
{
  const flows = treasuryFlowSnapshot({
    income: 128,
    services: 30,
    roads: 12,
    utilities: 6,
    surveys: 10,
    loans: 5,
    cityCount: 2,
  });
  assert.strictEqual(flows['stat-cash-income'], '+$128');
  assert.strictEqual(flows['stat-cash-service'], '-$30');
  assert.strictEqual(flows['stat-cash-road'], '-$12');
  assert.strictEqual(flows['stat-cash-utility'], '-$6');
  assert.strictEqual(flows['stat-cash-survey'], '-$10');
  assert.strictEqual(flows['stat-cash-loans'], '-$5');
  assert.strictEqual(flows['stat-cash-net'], '+$65', 'Net should subtract every outflow from income');
  assert.strictEqual(flows['stat-cash-survey-row-visible'], 'flex', 'Active surveys should show their row');
  assert.strictEqual(flows['stat-cash-cities'], '2');
  assert.strictEqual(flows['stat-cash-cities-row-visible'], 'flex', 'Multi-city worlds should name the city count');

  const simple = treasuryFlowSnapshot({ income: 20, services: 25, roads: 0, cityCount: 1 });
  assert.strictEqual(simple['stat-cash-net'], '-$5', 'A deficit should render as a negative net');
  assert.strictEqual(simple['stat-cash-survey-row-visible'], 'none', 'Idle surveys should hide their row');
  assert.strictEqual(simple['stat-cash-cities-row-visible'], 'none', 'A single city needs no city-count row');
  assert.strictEqual(simple['stat-cash-loans'], '-$0');

  const empty = treasuryFlowSnapshot();
  assert.strictEqual(empty['stat-cash-net'], '+$0');
  assert.strictEqual(empty['stat-cash-income'], '+$0');
}

{
  assert.strictEqual(weatherIcons({ cloudCover: 0.1, windIntensity: 0.1 }, true), '☀️🍃');
  assert.strictEqual(weatherIcons({ cloudCover: 0.1, windIntensity: 0.5 }, false), '🌙💨');
  assert.strictEqual(weatherIcons({ cloudCover: 0.5, windIntensity: 0.5 }, true), '⛅💨');
  assert.strictEqual(weatherIcons({ cloudCover: 0.5, windIntensity: 0.9 }, false), '☁️🌪️');
  assert.strictEqual(weatherIcons({ cloudCover: 0.8, windIntensity: 0.1 }, true), '🌧️🍃');
  assert.strictEqual(weatherIcons(null, true), '☀️', 'Missing weather falls back to day/night icon');
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

{
  // Every HUD field the snapshot writes must exist in the markup, so a renamed or typo'd
  // id is caught here instead of silently never updating on screen.
  const markup = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const simulation = new Simulation(grid);
  simulation.computeStats();
  const snapshot = buildHudSnapshot(simulation, 25000);
  // These two drive the alerts panel instead of being elements of their own.
  const nonElementKeys = new Set(['alerts-panel-visible', 'alerts-panel-data']);
  const missing = Object.keys(snapshot).filter((key) => !nonElementKeys.has(key) && !markup.includes(`id="${key}"`));
  assert.deepStrictEqual(missing, [], 'Every HUD snapshot field should have a matching element in index.html');
  for (const key of ['stat-sand', 'stat-glass', 'stat-computer-chips']) {
    assert.ok(key in snapshot, `${key} should be part of the HUD snapshot`);
  }
}

console.log('HUD update tests passed.');
