import assert from 'assert';
import { readFileSync } from 'node:fs';
import { Grid } from '../src/engine/Grid.js';
import { Renderer } from '../src/engine/Renderer.js';
import { Simulation } from '../src/engine/Simulation.js';
import { DENSITY, PRODUCER_CONFIG, PRODUCER_TYPE, RESIDENTIAL_CAPACITY, TERRAIN, ZONE } from '../src/config.js';

function createMockCtx(canvas) {
  return new Proxy({
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string') return () => {};
      return undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

class MockCanvas {
  constructor(width = 256, height = 256) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return createMockCtx(this);
  }
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas();
    return {};
  },
};

function flatten(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

function makeRenderer(grid, width = 800, height = 600) {
  const renderer = new Renderer(new MockCanvas(width, height), grid);
  renderer.setCamera(0, 0, 1);
  renderer.enableTiming = true;
  return renderer;
}

{
  const grid = new Grid(8, 8, 1);
  const renderer = makeRenderer(grid);
  const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const speedControls = markup.match(/<div class="speed-controls">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.ok(speedControls.indexOf('id="btn-toggle-audio"') < speedControls.indexOf('id="btn-overworld"'), 'World button should sit at the end beside Mute');
  assert.strictEqual((markup.match(/id="btn-overworld"/g) || []).length, 1, 'There should be one World button in the top bar');
  assert.ok(!markup.includes('class="overworld-toggle glass"'), 'World button should no longer float over the map');
  assert.ok(markup.includes('data-hud-tab="finance"'), 'Finance should have a HUD tab');
  for (const principal of [1000, 2500, 5000, 7500, 10000, 15000, 20000]) {
    assert.ok(markup.includes(`<option value="${principal}">`), `Finance should offer a $${principal.toLocaleString()} loan`);
  }
  assert.ok(markup.includes('id="overworld-treasury"'), 'The shared treasury should remain visible on the world map');
  assert.ok(markup.includes('Game over, all your people left'), 'The terminal game-over text should be present');
  assert.match(markup, /id="game-over-modal"[\s\S]*?<button id="btn-restart-game"[^>]*>Restart<\/button>/, 'Game over should offer a Restart button inside the terminal dialog');
  for (const type of [PRODUCER_TYPE.WAREHOUSE_ORE, PRODUCER_TYPE.WAREHOUSE_BAR, PRODUCER_TYPE.WAREHOUSE_GOODS]) {
    const ctx = createMockCtx(new MockCanvas());
    const painted = [];
    ctx.fillRect = () => painted.push(ctx.fillStyle);
    renderer.renderProducerTile(ctx, { producer: { type, x: 2, y: 2 } }, 0, 0);
    assert.strictEqual(painted[0], PRODUCER_CONFIG[type].color, `${type} walls should use their configured color`);
    const button = markup.match(new RegExp(`<button[^>]*data-tool="producer_${type}"[^>]*>(.*?)<\\/button>`))?.[1];
    assert.ok(button?.includes(`color:${PRODUCER_CONFIG[type].color}`), `${type} sidebar glyph should match its map color`);
  }
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  grid.getTile(1, 1).terrain = TERRAIN.FOREST;
  const simulation = new Simulation(grid);
  const renderer = makeRenderer(grid);

  renderer.render(simulation);
  const firstRebuild = renderer.lastTerrainRebuild;
  const chunk = renderer.terrainChunks[0][0];
  assert.strictEqual(firstRebuild.kind, 'full', 'The first frame should allocate terrain chunks');
  assert.ok(chunk?.ready, 'A small map should finish its terrain cache on the first frame');
  assert.ok(renderer.getRenderTimings().frameCount >= 1, 'Render-loop timing should record frames separately from simulation');
  assert.ok(Number.isFinite(renderer.getRenderTimings().lastMs), 'Render-loop timing should record a finite frame duration');


{
  const grid = new Grid(8, 8, 1);
  const renderer = makeRenderer(grid);
  const tile = {
    x: 1,
    y: 1,
    zone: ZONE.RESIDENTIAL,
    density: DENSITY.LIGHT,
    population: RESIDENTIAL_CAPACITY[DENSITY.LIGHT],
  };
  const fullCtx = createMockCtx(new MockCanvas());
  const fullFills = [];
  fullCtx.fillRect = (x, y, width, height) => fullFills.push({ color: fullCtx.fillStyle, x, y, width, height });
  renderer.renderZoneTile(fullCtx, tile, 32, 48);
  assert.ok(fullFills.some(({ color, x, y, width, height }) => (
    color === '#fde047' && x === 52 && y === 50 && width === 10 && height === 10
  )), 'Full zone should draw the corner capacity marker');

  const lowDetailCtx = createMockCtx(new MockCanvas());
  const lowDetailFills = [];
  lowDetailCtx.fillRect = (x, y, width, height) => lowDetailFills.push({ color: lowDetailCtx.fillStyle, x, y, width, height });
  renderer.renderLowDetailTile(lowDetailCtx, tile, 32, 48);
  assert.ok(lowDetailFills.some(({ color }) => color === '#fde047'), 'Full zone marker should remain visible at low detail');

  tile.population--;
  const partialCtx = createMockCtx(new MockCanvas());
  const partialFills = [];
  partialCtx.fillRect = (x, y, width, height) => partialFills.push({ color: partialCtx.fillStyle, x, y, width, height });
  renderer.renderZoneTile(partialCtx, tile, 32, 48);
  assert.ok(!partialFills.some(({ color }) => color === '#fde047'), 'Under-capacity zone should not draw the full marker');
}
  const chunkCanvas = chunk.canvas;
  simulation.tick();
  renderer.render(simulation);
  assert.strictEqual(renderer.lastTerrainRebuild.kind, 'none', 'A normal simulation tick should not rebuild terrain chunks');
  assert.strictEqual(renderer.lastTerrainRebuild.chunksRebuilt, 0, 'A normal simulation tick should rebuild zero terrain chunks');
  assert.strictEqual(renderer.terrainChunks[0][0], chunk, 'Stable ticks should keep the same chunk objects');
  assert.strictEqual(renderer.terrainChunks[0][0].canvas, chunkCanvas, 'Stable ticks should keep the same chunk canvases');

  renderer.setOverlayMode('pollution');
  renderer.render(simulation);
  assert.strictEqual(renderer.lastTerrainRebuild.kind, 'none', 'Overlay mode should not invalidate terrain chunks');
  assert.ok(renderer.lastOverlayDraws > 0, 'Pollution overlay should paint over visible tiles without a whole-map redraw');
  assert.strictEqual(renderer.terrainChunks[0][0].canvas, chunkCanvas, 'Overlay frames should reuse the existing terrain cache');

  grid.bulldoze(1, 1);
  renderer.render(simulation);
  assert.strictEqual(renderer.lastTerrainRebuild.kind, 'incremental', 'Forest bulldoze should rebuild only affected terrain chunks');
  assert.strictEqual(renderer.lastTerrainRebuild.chunksRebuilt, 1, 'A single forest clear should rebuild one chunk');
  assert.strictEqual(renderer.terrainChunks[0][0], chunk, 'Incremental rebuilds should keep the chunk object');

  grid.getTile(0, 0).terrain = TERRAIN.FOREST;
  grid.getTile(1, 0).terrain = TERRAIN.FOREST;
  renderer.render(simulation);
  grid.bulldoze(0, 0);
  grid.bulldoze(1, 0);
  renderer.render(simulation);
  assert.strictEqual(renderer.lastTerrainRebuild.kind, 'incremental', 'Multiple forest clears should stay incremental');
  assert.strictEqual(renderer.lastTerrainRebuild.chunksRebuilt, 1, 'Two tiles in the same chunk should rebuild that chunk once');

  grid.randomizeGrid(2);
  renderer.render(simulation);
  assert.strictEqual(renderer.lastTerrainRebuild.kind, 'full', 'Map regeneration should rebuild the whole terrain cache');
}

{
  const grid = new Grid(8, 8, 1);
  flatten(grid);
  const road = grid.getTile(3, 3);
  road.hasRoad = true;
  road.roadDamage = 40;
  grid.activeRoadTiles.add(road);
  const renderer = makeRenderer(grid);
  const damageBars = [];
  renderer.renderDamageBar = (_ctx, _x, _y, damage, color) => damageBars.push({ damage, color });
  renderer.render(new Simulation(grid));
  assert.ok(damageBars.some(({ damage, color }) => damage === 40 && color === '#f59e0b'), 'Roads should reuse the health bar with a road-damage color');
}

console.log('Renderer cache tests passed.');
