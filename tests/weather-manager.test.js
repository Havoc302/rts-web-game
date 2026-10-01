import assert from 'assert';
import { WeatherManager } from '../src/engine/WeatherManager.js';
import { Grid } from '../src/engine/Grid.js';
import { Simulation } from '../src/engine/Simulation.js';
import { FireManager } from '../src/engine/FireManager.js';
import {
  WEATHER_CONFIG,
  TEMPERATURE_CONFIG,
  TERRAIN,
  ZONE,
  DENSITY,
  PRODUCER_TYPE,
  FIRE_CONFIG,
} from '../src/config.js';

console.log('=== weather-manager.test.js ===');

// 1. Initial State
{
  const wm = new WeatherManager();
  assert.strictEqual(wm.windIntensity, 0.5, 'Default wind intensity should be 0.5');
  assert.strictEqual(wm.cloudCover, 0.2, 'Default cloud cover should be 0.2');
  assert.strictEqual(wm.temperature, TEMPERATURE_CONFIG.BASE_TEMP, 'Default temp should be BASE_TEMP (20°C)');
  assert.strictEqual(wm.extremeWindTicks, 0, 'Extreme wind ticks should start at 0');
}

// 2. Temperature Drift
{
  const wm = new WeatherManager();

  // Test cooling under heavy rain/clouds (cloudCover >= 0.8)
  wm.cloudCover = 0.9;
  wm.temperature = 10;
  // Override stepMetric to keep values constant during update
  const origStep = wm.stepMetric;
  wm.stepMetric = (val) => val;
  wm.update();
  assert.strictEqual(wm.temperature, 9, 'Rain/heavy clouds should cool temperature by 1°C per tick');

  // Test floor at MIN_TEMP
  wm.temperature = 0;
  wm.update();
  assert.strictEqual(wm.temperature, TEMPERATURE_CONFIG.MIN_TEMP, 'Temperature should not drop below MIN_TEMP');

  // Test warming under clear skies (cloudCover <= 0.4)
  wm.cloudCover = 0.1;
  wm.temperature = 39;
  wm.update();
  assert.strictEqual(wm.temperature, 40, 'Clear skies should warm temperature by 1°C per tick');

  // Test ceiling at MAX_TEMP
  wm.update();
  assert.strictEqual(wm.temperature, TEMPERATURE_CONFIG.MAX_TEMP, 'Temperature should not exceed MAX_TEMP');
  wm.stepMetric = origStep;
}

// 3. Extreme Wind Tracking
{
  const wm = new WeatherManager();
  wm.stepMetric = (val) => val;
  wm.windIntensity = WEATHER_CONFIG.WIND_HAZARD_THRESHOLD;
  wm.update();
  assert.strictEqual(wm.extremeWindTicks, 1, 'Extreme wind should increment extremeWindTicks');
  wm.update();
  assert.strictEqual(wm.extremeWindTicks, 2, 'Consecutive extreme wind should increment counter');

  wm.windIntensity = 0.5;
  wm.update();
  assert.strictEqual(wm.extremeWindTicks, 0, 'Normal wind should reset extremeWindTicks');
}

// 4. Solar Efficiency Curve
{
  const wm = new WeatherManager();
  wm.cloudCover = 0.0;
  assert.strictEqual(wm.getSolarEfficiency(), 1.0, '0% cloud cover should yield 100% solar efficiency');

  wm.cloudCover = 0.4;
  assert.strictEqual(Math.round(wm.getSolarEfficiency() * 100) / 100, 0.90, '0.4 cloud cover should yield 90% solar efficiency');

  wm.cloudCover = 1.0;
  assert.strictEqual(Math.round(wm.getSolarEfficiency() * 100) / 100, 0.10, '1.0 cloud cover should yield 10% solar efficiency');
}

// 5. Weather Label
{
  const wm = new WeatherManager();
  wm.cloudCover = 0.2;
  wm.windIntensity = 0.1;
  wm.temperature = 22;
  assert.strictEqual(wm.getWeatherLabel(), 'Sunny, Calm (22°C)');

  wm.cloudCover = 0.5;
  wm.windIntensity = 0.5;
  assert.strictEqual(wm.getWeatherLabel(), 'Cloudy, Breezy (22°C)');

  wm.cloudCover = 0.9;
  wm.windIntensity = 0.95;
  assert.strictEqual(wm.getWeatherLabel(), 'Raining, Gale Force (22°C)');
}

// 6. Simulation Extreme Temperature Patient Demand
{
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;

  const res = grid.getTile(2, 2);
  res.zone = ZONE.RESIDENTIAL;
  res.density = DENSITY.HIGH;
  res.population = 1000;
  res.growthScore = 50;
  grid.activeZonedTiles.add(res);

  const sim = new Simulation(grid);

  // Normal temperature (20°C): baseline patient demand
  sim.weatherManager.temperature = 20;
  sim.computeStats();
  const baselineDemand = sim.stats.patientDemand;

  // Cold snap (0°C): extreme cold health risk
  sim.weatherManager.temperature = 0; // Below HEALTH_RISK_LOW (5°C)
  sim.computeStats();
  assert.ok(sim.stats.patientDemand > baselineDemand, 'Cold snap should increase patient demand');
  assert.strictEqual(sim.stats.patientDemand, 9, 'Cold snap should add extreme weather patient demand (6.86 + 2.5 = 9.36 -> 9)');

  // Heatwave (38°C): extreme heat health risk
  sim.weatherManager.temperature = 38; // Above HEALTH_RISK_HIGH (35°C)
  sim.computeStats();
  assert.strictEqual(sim.stats.patientDemand, 9, 'Heatwave should add extreme weather patient demand');
}

// 7. Spontaneous fire risk with full rain or extreme heat
{
  assert.strictEqual(FIRE_CONFIG.BASE_IGNITION_CHANCE, 0.00001);
  assert.strictEqual(FIRE_CONFIG.FOREST_IGNITION_CHANCE, 0.000001);
  assert.strictEqual(FIRE_CONFIG.MAX_IGNITION_CHANCE_NON_INDUSTRIAL, 0.001);
  assert.strictEqual(FIRE_CONFIG.MAX_IGNITION_CHANCE_INDUSTRIAL, 0.002);
  assert.strictEqual(FIRE_CONFIG.HIGH_POLLUTION_IGNITION_BONUS, 0.0003);
  const grid = new Grid(8, 8, 1);
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;

  const forest = grid.getTile(3, 3);
  forest.terrain = TERRAIN.FOREST;
  grid.fireCandidateTiles.add(forest);

  const weather = new WeatherManager();
  const baseline = FIRE_CONFIG.FOREST_IGNITION_CHANCE;
  weather.cloudCover = 0.99;
  weather.temperature = 35;
  weather.windIntensity = 1.0;
  assert.strictEqual(FireManager.getSpontaneousIgnitionChance(forest, weather), baseline, 'Near-full rain and exactly 35 C do not boost ignition');
  weather.temperature = 36;
  assert.strictEqual(FireManager.getSpontaneousIgnitionChance(forest, weather), baseline * FIRE_CONFIG.EXTREME_WEATHER_IGNITION_MULTIPLIER, 'Temperature above 35 C boosts ignition without a thunderstorm');
  weather.cloudCover = 1.0;
  weather.temperature = 0;
  weather.windIntensity = 0;
  assert.strictEqual(FireManager.getSpontaneousIgnitionChance(forest, weather), baseline * FIRE_CONFIG.EXTREME_WEATHER_IGNITION_MULTIPLIER, 'Full rain boosts ignition even when cool and calm');
  weather.temperature = 36;
  assert.strictEqual(FireManager.getSpontaneousIgnitionChance(forest, weather), baseline * FIRE_CONFIG.EXTREME_WEATHER_IGNITION_MULTIPLIER, 'Rain and heat together must not stack multipliers');
  weather.temperature = 20;
  weather.getRainExtinguishChance = () => 0;
  const originalRandom = Math.random;
  try {
    Math.random = () => baseline * 1.2;
    weather.cloudCover = 0.99;
    FireManager.updateFires(grid, {}, weather);
    assert.strictEqual(forest.onFire, false, 'The real fire pass leaves the tile unlit below full rainfall');
    weather.cloudCover = 1.0;
    FireManager.updateFires(grid, {}, weather);
    assert.strictEqual(forest.onFire, true, 'The real fire pass applies the full-rain boost');
  } finally {
    Math.random = originalRandom;
  }
}

console.log('Weather manager tests passed.');
