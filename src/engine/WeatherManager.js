import { CLIMATE_CONFIG, WEATHER_CONFIG, TEMPERATURE_CONFIG } from '../config.js';

const DEFAULT_CLIMATE = {
  temperatureMean: TEMPERATURE_CONFIG.BASE_TEMP,
  temperatureStdDev: 5,
  temperatureMin: TEMPERATURE_CONFIG.MIN_TEMP,
  temperatureMax: TEMPERATURE_CONFIG.MAX_TEMP,
  weatherChances: { sunny: 0.45, cloudy: 0.35, rainy: 0.2 },
};

export class WeatherManager {
  constructor(climate = null) {
    this.climate = climate || DEFAULT_CLIMATE;
    this.windIntensity = 0.5;       // 0.0 (Calm) -> 1.0 (Gale Force)
    this.cloudCover = 0.2;          // 0.0 (Sunny) -> 0.5 (Cloudy) -> 1.0 (Raining)
    this.temperature = this.climate.temperatureMean;
    this.weatherTargetCloud = 0.2;
    this.weatherTicksRemaining = 0;
    this.extremeWindTicks = 0;
  }

  setClimate(climate) {
    if (climate) this.climate = climate;
      if (!climate) return;
      this.climate = climate;
      this.temperature = Math.min(climate.temperatureMax, Math.max(climate.temperatureMin, this.temperature));
  }

  update() {
    this.windIntensity = this.stepMetric(this.windIntensity);
    if (this.weatherTicksRemaining <= 0) this.chooseWeatherTarget();
    this.cloudCover = this.stepMetric(this.cloudCover, this.weatherTargetCloud);
    this.weatherTicksRemaining--;

    const temperatureTarget = this.climate.temperatureMean + (0.5 - this.cloudCover) * 2;
    const noiseScale = this.climate.temperatureStdDev * Math.sqrt(2 * CLIMATE_CONFIG.TEMP_REVERSION);
    this.temperature += (temperatureTarget - this.temperature) * CLIMATE_CONFIG.TEMP_REVERSION +
      this.sampleNormal() * noiseScale;
    this.temperature = Math.min(this.climate.temperatureMax, Math.max(this.climate.temperatureMin, this.temperature));

    // Over-speed wind tracking
    if (this.windIntensity >= WEATHER_CONFIG.WIND_HAZARD_THRESHOLD) {
      this.extremeWindTicks++;
    } else {
      this.extremeWindTicks = 0;
    }
  }

  chooseWeatherTarget() {
    const chance = Math.random();
    const { sunny, cloudy, rainy } = this.climate.weatherChances;
    this.weatherTargetCloud = chance < sunny ? 0.2 : chance < sunny + cloudy ? 0.55 : 0.9;
    this.weatherTicksRemaining = CLIMATE_CONFIG.WEATHER_MIN_DURATION + Math.floor(
      Math.random() * (CLIMATE_CONFIG.WEATHER_MAX_DURATION - CLIMATE_CONFIG.WEATHER_MIN_DURATION + 1)
    );
  }

  sampleNormal() {
    const first = Math.max(Number.EPSILON, Math.random());
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * Math.random());
  }

  stepMetric(currentVal, target = 0.5) {
    const pull = (target - currentVal) * WEATHER_CONFIG.MEAN_REVERSION_STRENGTH;
    const rawNoise = (Math.random() - 0.5) * 0.3;
    const clampedDelta = Math.min(
      WEATHER_CONFIG.MAX_TICK_DELTA,
      Math.max(-WEATHER_CONFIG.MAX_TICK_DELTA, pull + rawNoise)
    );
    return Math.min(1.0, Math.max(0.0, currentVal + clampedDelta));
  }

  getSolarEfficiency() {
    const c = this.cloudCover;
    if (c <= 0.4) return 1.0 - (c / 0.4) * 0.10;
    if (c <= 0.7) return 0.85 - ((c - 0.4) / 0.3) * 0.35;
    return 0.40 - ((c - 0.7) / 0.3) * 0.30;
  }

  // 0 when not raining, 0..1 from light rain to a downpour.
  getRainIntensity() {
    const threshold = WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD;
    if (this.cloudCover <= threshold) return 0;
    return Math.min(1, (this.cloudCover - threshold) / (1 - threshold));
  }

  getRainExtinguishChance() {
    if (this.cloudCover <= WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD) return 0;
    const { RAIN_EXTINGUISH_MIN_CHANCE: min, RAIN_EXTINGUISH_MAX_CHANCE: max } = WEATHER_CONFIG;
    return min + (max - min) * this.getRainIntensity();
  }

  getWeatherLabel() {
    const cloud = this.cloudCover <= 0.4 ? 'Sunny' : this.cloudCover <= 0.7 ? 'Cloudy' : 'Raining';
    const wind = this.windIntensity <= 0.2 ? 'Calm' : this.windIntensity <= 0.7 ? 'Breezy' : 'Gale Force';
    return `${cloud}, ${wind} (${this.temperature}°C)`;
  }
}
