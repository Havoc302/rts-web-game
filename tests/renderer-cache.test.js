import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Renderer } from '../src/engine/Renderer.js';
import { Simulation } from '../src/engine/Simulation.js';
import { TERRAIN } from '../src/config.js';

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

console.log('Renderer cache tests passed.');
