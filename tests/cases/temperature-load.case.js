import assert from 'assert';
import {
  DENSITY,
  PRODUCER_TYPE,
  RESIDENTIAL_CAPACITY,
  TEMPERATURE_CONFIG,
  TERRAIN,
  ZONE,
  temperatureExcursion,
  temperatureHappinessPenalty,
  temperaturePowerFactor,
} from '../../src/config.js';
import { Grid } from '../../src/engine/Grid.js';
import { ResourceManager } from '../../src/engine/ResourceManager.js';
import { Simulation } from '../../src/engine/Simulation.js';
import { UtilityManager } from '../../src/engine/UtilityManager.js';

console.log('=== temperature-load.case.js ===');

const COMFORT_MIN = TEMPERATURE_CONFIG.COMFORT_MIN;   // 10 °C
const COMFORT_MAX = TEMPERATURE_CONFIG.COMFORT_MAX;   // 35 °C
const CAP = TEMPERATURE_CONFIG.HAPPINESS_PENALTY_CAP; // 10 happiness
const RAMP = TEMPERATURE_CONFIG.POWER_DEMAND_DOUBLE_EXCURSION; // 20 °C

function clearTerrain(grid) {
  for (const row of grid.tiles) for (const tile of row) tile.terrain = TERRAIN.FLAT;
}

// --- The comfort band and the shared excursion ramp --------------------------------------
{
  for (const comfortable of [COMFORT_MIN, 20, COMFORT_MAX]) {
    assert.strictEqual(temperatureExcursion(comfortable), 0, `${comfortable}°C is comfortable`);
    assert.strictEqual(temperaturePowerFactor(comfortable), 1, 'Comfortable weather adds no power load');
    assert.strictEqual(temperatureHappinessPenalty(comfortable), 0, 'Comfortable weather costs no happiness');
  }
  assert.strictEqual(temperatureExcursion(0), 10, 'Excursion is the distance below the comfort floor');
  assert.strictEqual(temperatureExcursion(45), 10, 'Excursion is the distance above the comfort ceiling');
  assert.strictEqual(temperatureExcursion(-10), 20);
  assert.strictEqual(temperatureExcursion(55), 20);

  // Power: linear and uncapped, doubling every RAMP degrees outside the band.
  assert.strictEqual(temperaturePowerFactor(0), 1.5, 'Cold start: half again the power');
  assert.strictEqual(temperaturePowerFactor(45), 1.5, 'Heat scales power exactly like cold');
  assert.strictEqual(temperaturePowerFactor(-10), 2, '20°C outside the band doubles every power draw');
  assert.strictEqual(temperaturePowerFactor(55), 2, '55°C doubles every power draw');
  assert.strictEqual(temperaturePowerFactor(-40), 3.5, 'Power keeps climbing past the doubling point');
  assert.strictEqual(temperaturePowerFactor(70), 2.75, 'Heat keeps climbing past the doubling point too');

  // Happiness: same ramp, but capped because past some point it is simply cold.
  assert.strictEqual(temperatureHappinessPenalty(0), 5);
  assert.strictEqual(temperatureHappinessPenalty(45), 5);
  assert.strictEqual(temperatureHappinessPenalty(-10), CAP, 'The penalty reaches its cap 20°C outside the band');
  assert.strictEqual(temperatureHappinessPenalty(55), CAP);
  assert.strictEqual(temperatureHappinessPenalty(-40), CAP, 'A polar city loses no more than the cap');
  assert.strictEqual(temperatureHappinessPenalty(70), CAP);

  for (const unknown of [undefined, null, NaN, 'cold']) {
    assert.strictEqual(temperaturePowerFactor(unknown), 1, 'An unknown temperature adds no power load');
    assert.strictEqual(temperatureHappinessPenalty(unknown), 0, 'An unknown temperature costs no happiness');
  }
}

// --- Zoned tiles scale on power only ----------------------------------------------------
{
  const home = { zone: ZONE.RESIDENTIAL, density: DENSITY.HIGH, population: 500, maxPopulation: 500 };
  const basePower = UtilityManager.getTileUtilityUsage(home, 'power', 1);
  assert.strictEqual(basePower, 3, 'A full high-density home draws its configured 3 power');
  assert.strictEqual(UtilityManager.getTileUtilityUsage(home, 'power', 2), basePower * 2);
  assert.strictEqual(UtilityManager.getTileUtilityUsage(home, 'power', 3.5), basePower * 3.5);
  assert.strictEqual(UtilityManager.getTileUtilityUsage(home, 'water', 3.5), 5, 'Water demand ignores the temperature');
  assert.strictEqual(UtilityManager.getTileUtilityUsage(home, 'sewage', 3.5), 5, 'Sewage demand ignores the temperature');
}

// --- A live city: pumps, plants, and a home all pay the heating/cooling bill ------------
function buildCity(plantCapacity = 100) {
  const grid = new Grid(12, 12, 1);
  clearTerrain(grid);
  grid.tiles[3][0].terrain = TERRAIN.WATER;
  grid.tiles[5][0].terrain = TERRAIN.WATER;
  grid.placeProducer(1, 1, PRODUCER_TYPE.POWER_PLANT, plantCapacity);
  assert.ok(grid.placeProducer(1, 3, PRODUCER_TYPE.WATER_TOWER, 100), 'The water pump needs adjacent water');
  assert.ok(grid.placeProducer(1, 5, PRODUCER_TYPE.SEWAGE_PLANT, 100), 'The sewage plant needs adjacent water');
  for (let y = 1; y <= 5; y++) grid.placeRoad(2, y);
  const home = grid.getTile(3, 1);
  home.zone = ZONE.RESIDENTIAL;
  home.density = DENSITY.HIGH;
  home.population = RESIDENTIAL_CAPACITY[DENSITY.HIGH];
  home.maxPopulation = RESIDENTIAL_CAPACITY[DENSITY.HIGH];
  home.growthScore = 50;
  grid.activeZonedTiles.add(home);
  return { grid, home };
}

{
  const { grid, home } = buildCity();
  const simulation = new Simulation(grid);
  const observe = (temperature) => {
    simulation.weatherManager.temperature = temperature;
    simulation.tick(false);
    const plant = grid.producers.find((producer) => producer.type === PRODUCER_TYPE.POWER_PLANT);
    return {
      demand: simulation.stats.powerDemand,
      served: plant.usedCapacity,
      water: simulation.stats.waterDemand,
      sewage: simulation.stats.sewageDemand,
      shortfall: home.shortfall.power,
    };
  };

  // Water pump 2 + sewage plant 2 + high-density home 3, with no weather load.
  const mild = observe(20);
  assert.strictEqual(mild.demand, 7, 'Mild weather demand is the raw pump, plant, and home draw');
  assert.strictEqual(mild.served, mild.demand, 'Allocation charges exactly the reported demand');
  assert.strictEqual(mild.shortfall, false);

  const cold = observe(-10);
  assert.strictEqual(cold.demand, mild.demand * 2, 'Every tile that draws power doubles 20°C below the band');
  assert.strictEqual(cold.served, cold.demand, 'The extra load is actually allocated, not just reported');
  assert.strictEqual(cold.water, mild.water, 'Water demand is unchanged by the cold');
  assert.strictEqual(cold.sewage, mild.sewage, 'Sewage demand is unchanged by the cold');

  const hot = observe(45);
  assert.strictEqual(hot.demand, mild.demand * 1.5, 'Heat adds power load on the same linear ramp');
  assert.strictEqual(hot.served, hot.demand);
  assert.strictEqual(hot.water, mild.water, 'Water demand is unchanged by the heat');
  assert.strictEqual(hot.sewage, mild.sewage, 'Sewage demand is unchanged by the heat');

  const heatwave = observe(55);
  assert.strictEqual(heatwave.demand, mild.demand * 2, '55°C doubles the whole city load');
  assert.strictEqual(heatwave.served, heatwave.demand);
}

// --- Power scaling has teeth: a city sized for mild weather browns out ------------------
{
  const { grid, home } = buildCity(7);
  const simulation = new Simulation(grid);
  simulation.weatherManager.temperature = 20;
  simulation.tick(false);
  assert.strictEqual(home.shortfall.power, false, 'A plant sized for mild weather covers the city at 20°C');
  simulation.weatherManager.temperature = -40;
  simulation.tick(false);
  assert.strictEqual(home.shortfall.power, true, 'The same city browns out when the freeze pushes demand to 3.5x');
}

// --- Happiness takes a small, capped hit -------------------------------------------------
{
  const grid = new Grid(8, 8, 1);
  clearTerrain(grid);
  const home = grid.getTile(2, 2);
  home.zone = ZONE.RESIDENTIAL;
  home.density = DENSITY.HIGH;
  home.population = 100;
  home.maxPopulation = RESIDENTIAL_CAPACITY[DENSITY.HIGH];
  grid.activeZonedTiles.add(home);
  const manager = new ResourceManager();
  const statsFor = () => ({ population: 100, taxRate: 40, employmentRate: 1, untreatedPatients: 0, fireInjuries: 0 });
  const happiness = (temperature) => manager.calculateHappiness(grid, statsFor(), 1, false, temperature);

  const mild = happiness(20);
  assert.strictEqual(mild - happiness(10), 0, 'The comfort floor costs nothing');
  assert.strictEqual(mild - happiness(35), 0, 'The comfort ceiling costs nothing');
  assert.strictEqual(mild - happiness(0), 5, 'A moderate chill is half the penalty');
  assert.strictEqual(mild - happiness(45), 5, 'A moderate heatwave is half the penalty');
  assert.strictEqual(mild - happiness(-10), CAP, 'A real freeze costs the full penalty');
  assert.strictEqual(happiness(-45), happiness(-10), 'Colder than the cap is no worse');
  assert.strictEqual(happiness(55), happiness(-10), 'A heatwave and a deep freeze cost the same');
  assert.strictEqual(manager.calculateHappiness(grid, statsFor(), 1, false), mild,
    'Callers that pass no temperature keep the previous behaviour');
}

// --- Simulation feeds the live temperature into both systems ----------------------------
{
  const cityClimate = (temperatureMean) => ({
    temperatureMean,
    temperatureStdDev: 0,
    temperatureMin: temperatureMean - 1,
    temperatureMax: temperatureMean + 1,
    weatherChances: { sunny: 1, cloudy: 0, rainy: 0 },
  });
  const run = (temperatureMean, grid) => {
    const simulation = new Simulation(grid, cityClimate(temperatureMean));
    simulation.tick();
    return simulation;
  };

  const warm = run(20, buildCity().grid);
  const cold = run(-15, buildCity().grid);
  assert.ok(cold.weatherManager.temperature < COMFORT_MIN - 20, 'The cold run should sit well outside the band');
  assert.ok(cold.stats.powerDemand > warm.stats.powerDemand,
    'A frozen city draws more power than the same city in mild weather');

  // An empty map isolates happiness, which a populated city also nudges through cold-weather
  // patients, so the only difference left is the temperature term itself.
  const warmTown = run(20, new Grid(8, 8, 1));
  const coldTown = run(-15, new Grid(8, 8, 1));
  assert.strictEqual(warmTown.stats.happiness - coldTown.stats.happiness, CAP,
    'A frozen city loses exactly the capped happiness penalty through the live tick');
}

console.log('Temperature load tests passed.');
