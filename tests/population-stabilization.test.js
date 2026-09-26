import assert from 'assert';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { POPULATION_STABILIZATION_CONFIG } from '../src/config.js';

console.log('=== population-stabilization.test.js ===');

// 1. Config assertions
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.MAX_POPULATION_SHIFT_PER_TICK, 0.015, 'Max shift rate is 1.5%');
assert.strictEqual(POPULATION_STABILIZATION_CONFIG.MIN_POPULATION_SHIFT_FLOOR, 1, 'Floor shift is 1');

// 2. processPopulationTick unit tests
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);

  // Zero delta
  sim.stats.population = 1000;
  assert.strictEqual(sim.processPopulationTick(0), 0, 'Zero delta returns 0');
  assert.strictEqual(sim.stats.population, 1000, 'Zero delta does not change population');

  // Transient fault absorption: -3000 drop at 1000 pop clamps to -15 (1.5%)
  const clampedDrop = sim.processPopulationTick(-3000);
  assert.strictEqual(clampedDrop, -15, 'Transient -3,000 drop at 1,000 pop clamps to -15');
  assert.strictEqual(sim.stats.population, 985, 'Population drops to 985');

  // Transient rebound: +500 surge at 985 pop clamps to +14 (floor(985 * 0.015) = 14)
  const clampedSurge = sim.processPopulationTick(500);
  assert.strictEqual(clampedSurge, 14, 'Surge is clamped to 1.5% max shift');
  assert.strictEqual(sim.stats.population, 999, 'Population increases to 999');

  // Small delta within limits is uninhibited
  sim.stats.population = 1000;
  const smallDelta = sim.processPopulationTick(5);
  assert.strictEqual(smallDelta, 5, 'Delta within max shift is applied directly');
  assert.strictEqual(sim.stats.population, 1005, 'Population increases by exact small delta');

  // Low population floor prevents early-game stall
  sim.stats.population = 0;
  const earlyGrowth = sim.processPopulationTick(10);
  assert.strictEqual(earlyGrowth, 1, 'Low population uses floor of 1');
  assert.strictEqual(sim.stats.population, 1, 'Population increases by floor of 1');

  // Population never drops below 0
  sim.stats.population = 0;
  const negativeDrop = sim.processPopulationTick(-10);
  assert.strictEqual(negativeDrop, -1, 'Floor allows -1 drop');
  assert.strictEqual(sim.stats.population, 0, 'Population clamped at 0 lower bound');
}

// 3. Sustained crisis compound drain (~26% loss over 20 ticks)
{
  const grid = new Grid(8, 8);
  const sim = new Simulation(grid);
  sim.stats.population = 1000;

  for (let i = 0; i < 20; i++) {
    sim.processPopulationTick(-500); // Continuous crisis
  }

  // 1000 with integer floor 1.5% shifts over 20 ticks reaches 748 (~25.2% loss).
  assert.ok(sim.stats.population >= 735 && sim.stats.population <= 755, `20 ticks of sustained crisis yields ~25-26% loss (got ${sim.stats.population})`);
}

console.log('Population stabilization tests passed.');
