import assert from 'assert';
import { Grid } from '../../src/engine/Grid.js';
import {
  PRODUCER_TYPE,
  SEWAGE_TIER_CONFIG,
  TERRAIN,
  WATER_TIER_CONFIG,
  getProducerUpgradeCost,
  getProducerUtilityUsage,
  getSewageCapacityForTier,
  getWaterCapacityForTier,
  isTieredProducer,
} from '../../src/config.js';

function flatGrid(size = 16) {
  const grid = new Grid(size, size, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
  return grid;
}

// Tier ladders: capacity doubles, upgrades cost 1.8x the previous tier rounded to $10.
assert.deepStrictEqual(WATER_TIER_CONFIG.capacity, [120, 240, 480]);
assert.deepStrictEqual(SEWAGE_TIER_CONFIG.capacity, [120, 240, 480]);
assert.deepStrictEqual(WATER_TIER_CONFIG.cost, [930, 1670, 3000]);
assert.deepStrictEqual(SEWAGE_TIER_CONFIG.cost, [1230, 2220, 4000]);
assert.strictEqual(isTieredProducer(PRODUCER_TYPE.WATER_TOWER), true);
assert.strictEqual(isTieredProducer(PRODUCER_TYPE.SEWAGE_PLANT), true);

for (const ladder of [WATER_TIER_CONFIG.cost, SEWAGE_TIER_CONFIG.cost]) {
  const [first, second, third] = ladder;
  assert.ok(second < first * 2, 'A tier-2 upgrade must beat two new tier-1 buildings');
  assert.ok(third < first * 4, 'A tier-3 upgrade must beat four new tier-1 buildings');
  assert.strictEqual(second % 10, 0, 'Upgrade prices are rounded to the nearest $10');
  assert.strictEqual(third % 10, 0, 'Upgrade prices are rounded to the nearest $10');
}

// Water pump: tier 1 capacity and utility draw, then upgrades.
{
  const grid = flatGrid();
  grid.getTile(5, 5).terrain = TERRAIN.WATER;
  const water = grid.placeProducer(6, 5, PRODUCER_TYPE.WATER_TOWER);
  assert.ok(water, 'A water pump should place beside water');
  assert.strictEqual(water.tier, 1);
  assert.strictEqual(water.capacity, 120);
  assert.deepStrictEqual(getProducerUtilityUsage(water), { power: 2, water: 0, sewage: 1 });

  assert.strictEqual(grid.canUpgradeProducer(grid.getTile(6, 5)), true);
  assert.strictEqual(getProducerUpgradeCost(PRODUCER_TYPE.WATER_TOWER, 1), 1670);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(6, 5)), true);
  assert.strictEqual(water.tier, 2);
  assert.strictEqual(water.capacity, 240);
  assert.deepStrictEqual(getProducerUtilityUsage(water), { power: 4, water: 0, sewage: 2 });

  assert.strictEqual(getProducerUpgradeCost(PRODUCER_TYPE.WATER_TOWER, 2), 3000);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(6, 5)), true);
  assert.strictEqual(water.tier, 3);
  assert.strictEqual(water.capacity, 480);
  assert.deepStrictEqual(getProducerUtilityUsage(water), { power: 8, water: 0, sewage: 4 });
  assert.strictEqual(grid.canUpgradeProducer(grid.getTile(6, 5)), false, 'Tier 3 is the maximum');
  assert.strictEqual(getWaterCapacityForTier(3), 480);
}

// Sewage plant: same ladder, mirrored utility draw.
{
  const grid = flatGrid();
  grid.getTile(9, 9).terrain = TERRAIN.WATER;
  const sewage = grid.placeProducer(10, 9, PRODUCER_TYPE.SEWAGE_PLANT);
  assert.ok(sewage, 'A sewage plant should place beside water');
  assert.strictEqual(sewage.tier, 1);
  assert.strictEqual(sewage.capacity, 120);
  assert.deepStrictEqual(getProducerUtilityUsage(sewage), { power: 2, water: 1, sewage: 0 });

  assert.strictEqual(getProducerUpgradeCost(PRODUCER_TYPE.SEWAGE_PLANT, 1), 2220);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(10, 9)), true);
  assert.strictEqual(sewage.tier, 2);
  assert.strictEqual(sewage.capacity, 240);
  assert.deepStrictEqual(getProducerUtilityUsage(sewage), { power: 4, water: 2, sewage: 0 });

  assert.strictEqual(getProducerUpgradeCost(PRODUCER_TYPE.SEWAGE_PLANT, 2), 4000);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(10, 9)), true);
  assert.strictEqual(sewage.tier, 3);
  assert.strictEqual(sewage.capacity, 480);
  assert.deepStrictEqual(getProducerUtilityUsage(sewage), { power: 8, water: 4, sewage: 0 });
  assert.strictEqual(getSewageCapacityForTier(3), 480);
}

// An explicit capacity (used by tests and old call sites) still overrides tier 1,
// and upgrading adopts the tier ladder afterwards.
{
  const grid = flatGrid();
  grid.getTile(2, 2).terrain = TERRAIN.WATER;
  const water = grid.placeProducer(3, 2, PRODUCER_TYPE.WATER_TOWER, 100);
  assert.strictEqual(water.capacity, 100);
  assert.strictEqual(grid.upgradeProducer(grid.getTile(3, 2)), true);
  assert.strictEqual(water.capacity, 240);
}

console.log('Water and sewage tier tests passed.');
