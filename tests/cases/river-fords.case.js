// River depth is a two-step property: DEEP everywhere, LOW inside a natural ford. Fords are meant to
// be rare (most maps have none), inland, shaped by the seed rather than by a ruler, and wide enough
// that the shallow water reaches the far bank so a future vehicle can actually drive across.
import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import { BIOME_TYPES, RIVER_DEPTH, RIVER_FORD_CONFIG, TERRAIN } from '../../src/config.js';

console.log('=== river-fords.case.js ===');

const MAP = 200;
const COAST = ['N'];
// Seeds picked from the measured distribution: 471756 rolls one ford in plains and tundra,
// 535108 rolls two.
const ONE_FORD_SEED = 471756;
const TWO_FORD_SEED = 535108;
const CARDINALS = [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']];

const cityMap = (seed, biome = BIOME_TYPES.PLAINS) => new Grid(MAP, MAP, seed, biome, 2, 4, COAST);
const key = (x, y) => `${x},${y}`;
const shallowTiles = (grid) => grid.tiles.flat().filter((tile) => tile.riverDepth === RIVER_DEPTH.LOW);

/** The 4-connected shallow patch a ford belongs to, keyed by "x,y". */
const fordPatch = (grid, ford) => {
  const patch = new Map();
  const start = grid.getTile(ford.x, ford.y);
  if (!start || start.riverDepth !== RIVER_DEPTH.LOW) return patch;
  patch.set(key(ford.x, ford.y), start);
  const queue = [[ford.x, ford.y]];
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const neighbour = grid.getTile(x + dx, y + dy);
      if (!neighbour || neighbour.riverDepth !== RIVER_DEPTH.LOW) continue;
      const neighbourKey = key(neighbour.x, neighbour.y);
      if (patch.has(neighbourKey)) continue;
      patch.set(neighbourKey, neighbour);
      queue.push([neighbour.x, neighbour.y]);
    }
  }
  return patch;
};

/** The shores a patch touches, ignoring the sea: only dry land counts as a bank. */
const bankSides = (grid, patch) => {
  const sides = new Set();
  for (const tile of patch.values()) {
    for (const [dx, dy, side] of CARDINALS) {
      const neighbour = grid.getTile(tile.x + dx, tile.y + dy);
      if (!neighbour || neighbour.terrain === TERRAIN.WATER || neighbour.terrain === TERRAIN.SALT_WATER) continue;
      sides.add(side);
    }
  }
  return sides;
};

/** A ford is usable when the shallow patch itself joins one shore to the shore opposite it. */
const touchesOppositeBanks = (sides) => (sides.has('n') && sides.has('s')) || (sides.has('e') && sides.has('w'));

// --- Two steps, and only a river is ever shallow -------------------------------------------
{
  const grid = cityMap(TWO_FORD_SEED);
  assert.strictEqual(grid.riverFords.length, 2, 'The sample seed should roll two fords');

  const depths = new Set(grid.tiles.flat().map((tile) => tile.riverDepth));
  assert.deepStrictEqual([...depths].sort(), [RIVER_DEPTH.LOW, RIVER_DEPTH.DEEP],
    'Water has exactly two depth steps');

  for (const tile of shallowTiles(grid)) {
    assert.strictEqual(tile.terrain, TERRAIN.WATER, 'A shallow tile is always river water');
    assert.ok(grid.isFordTile(tile.x, tile.y), 'isFordTile agrees with the tile depth');
  }
  const salt = grid.tiles.flat().filter((tile) => tile.terrain === TERRAIN.SALT_WATER);
  assert.ok(salt.length > 0, 'The coastal map should have sea');
  assert.ok(salt.every((tile) => tile.riverDepth !== RIVER_DEPTH.LOW),
    'The sea is never a shallow crossing');
  assert.strictEqual(grid.isFordTile(0, 0), false, 'Dry land is not a ford');
}

// --- Most maps have none, some have one, a few have two ------------------------------------
{
  const tally = { 0: 0, 1: 0, 2: 0 };
  let tooMany = 0;
  const SEEDS = 20;
  for (let index = 0; index < SEEDS; index++) {
    const grid = cityMap(424242 + index * 7919);
    const count = grid.riverFords.length;
    if (count in tally) tally[count] += 1;
    else tooMany += 1;
  }
  assert.strictEqual(tooMany, 0, 'A map never gets more than two fords');
  assert.ok(tally[0] / SEEDS >= 0.6, `Most maps should have no ford at all, saw ${tally[0]}/${SEEDS}`);
  assert.ok(tally[0] > tally[1] && tally[1] >= tally[2],
    `Fords should get rarer the more a map has: ${JSON.stringify(tally)}`);
}

// --- Every ford joins one bank to the one opposite, so a vehicle could cross -----------------
{
  const SEEDS = 20;
  let checked = 0;
  for (let index = 0; index < SEEDS; index++) {
    const grid = cityMap(424242 + index * 7919);
    for (const ford of grid.riverFords) {
      const patch = fordPatch(grid, ford);
      const sides = bankSides(grid, patch);
      checked++;
      assert.ok(patch.size > 0, `Ford at (${ford.x},${ford.y}) should sit on shallow water`);
      assert.ok(touchesOppositeBanks(sides),
        `Ford at (${ford.x},${ford.y}) only touches banks ${[...sides].sort().join('') || 'none'}, so it never crosses`);
      assert.ok(patch.size >= 4, `A ford spans the channel, saw only ${patch.size} tiles`);
      assert.ok(patch.size <= RIVER_FORD_CONFIG.MAX_TILES,
        `A ford stays a gravel bar, saw ${patch.size} tiles`);
    }
  }
  assert.ok(checked > 0, 'The sampled seeds should produce at least one ford to check');
}

// --- The shape comes from the seed, so no two fords share one silhouette ---------------------
{
  const shapes = new Set();
  // The first 20 sample seeds produce 5 fords between them.
  for (let index = 0; index < 20; index++) {
    const grid = cityMap(424242 + index * 7919);
    for (const ford of grid.riverFords) {
      // Fingerprint the patch relative to its own ford centre: a fixed stamp would repeat.
      const shape = [...fordPatch(grid, ford).values()]
        .map((tile) => `${tile.x - ford.x}:${tile.y - ford.y}`)
        .sort()
        .join('|');
      shapes.add(shape);
    }
  }
  assert.ok(shapes.size >= 3, `Fords should not all share one silhouette, saw ${shapes.size} shapes`);
  assert.ok([...shapes].every((shape) => shape.split('|').length >= 4), 'Every ford covers several tiles');
}

// --- A ford is a short run of shallow water, kept inland -----------------------------------
{
  const grid = cityMap(TWO_FORD_SEED);
  const shallow = shallowTiles(grid);
  assert.ok(shallow.length > 0);

  for (const ford of grid.riverFords) {
    assert.ok(ford.length >= RIVER_FORD_CONFIG.RUN_MIN && ford.length <= RIVER_FORD_CONFIG.RUN_MAX,
      `A ford covers ${RIVER_FORD_CONFIG.RUN_MIN}-${RIVER_FORD_CONFIG.RUN_MAX} path steps, saw ${ford.length}`);
    const clearance = grid.seaDistance ? grid.seaDistance[grid.terrainKey(ford.x, ford.y)] ?? 0 : Infinity;
    assert.ok(clearance >= RIVER_FORD_CONFIG.MIN_SEA_DISTANCE,
      `Ford at (${ford.x},${ford.y}) sits ${clearance} tiles from the sea, wanted ${RIVER_FORD_CONFIG.MIN_SEA_DISTANCE}`);
  }

  // Two fords keep their distance: the channel between them is deep water.
  const [first, second] = grid.riverFords;
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  assert.ok(distance >= RIVER_FORD_CONFIG.MIN_SPACING / 2,
    `Two fords should stay apart, saw ${distance.toFixed(1)} tiles`);

  // Each ford is one contiguous patch of shallow water, not scattered tiles.
  const remaining = new Set(shallow.map((tile) => `${tile.x},${tile.y}`));
  const patches = [];
  while (remaining.size > 0) {
    const [seedKey] = remaining;
    const queue = [seedKey];
    remaining.delete(seedKey);
    let size = 0;
    while (queue.length > 0) {
      const key = queue.shift();
      size++;
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const neighbour = `${x + dx},${y + dy}`;
        if (!remaining.has(neighbour)) continue;
        remaining.delete(neighbour);
        queue.push(neighbour);
      }
    }
    patches.push(size);
  }
  assert.strictEqual(patches.length, grid.riverFords.length,
    `Each ford should be one patch, saw patches of ${patches.join(', ')}`);
  for (const size of patches) assert.ok(size >= 4, `A ford spans the channel, saw only ${size} tiles`);
}

// --- Same seed, same fords ----------------------------------------------------------------
{
  const first = cityMap(ONE_FORD_SEED);
  const second = cityMap(ONE_FORD_SEED);
  assert.deepStrictEqual(second.riverFords, first.riverFords, 'Fords are deterministic for a seed');
  const coordinates = (grid) => shallowTiles(grid).map((tile) => `${tile.x},${tile.y}`).sort();
  assert.deepStrictEqual(coordinates(second), coordinates(first), 'The shallow tiles are identical too');
}

// --- No river, no fords -------------------------------------------------------------------
{
  const desert = cityMap(424242, BIOME_TYPES.DESERT);
  assert.strictEqual(desert.getBiomeModifiers().riverMode, 'none', 'Deserts have no river to ford');
  assert.strictEqual(desert.riverFords.length, 0);
  assert.strictEqual(shallowTiles(desert).length, 0);
}

// --- A frozen river keeps its fords open --------------------------------------------------
{
  const tundra = cityMap(ONE_FORD_SEED, BIOME_TYPES.TUNDRA);
  assert.ok(tundra.riverFords.length > 0, 'The sample seed should ford in tundra too');
  const shallow = shallowTiles(tundra);
  assert.ok(shallow.length > 0);
  assert.ok(shallow.every((tile) => tile.terrain === TERRAIN.WATER),
    'A ford stays open water: a frozen crossing would defeat its purpose');
  assert.ok(tundra.tiles.flat().some((tile) => tile.terrain === TERRAIN.ICE),
    'The tundra river should still freeze away from the ford');
}

console.log('River ford tests passed.');
