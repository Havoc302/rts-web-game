import { WEATHER_CONFIG, TEMPERATURE_CONFIG } from '../config.js';

export class WeatherManager {
  constructor() {
    this.windIntensity = 0.5;       // 0.0 (Calm) -> 1.0 (Gale Force)
    this.cloudCover = 0.2;          // 0.0 (Sunny) -> 0.5 (Cloudy) -> 1.0 (Raining)
    this.temperature = TEMPERATURE_CONFIG.BASE_TEMP; // Degrees C
    this.extremeWindTicks = 0;
  }

  update() {
    this.windIntensity = this.stepMetric(this.windIntensity);
    this.cloudCover = this.stepMetric(this.cloudCover);

    // Temperature drift based on precipitation/cloudiness
    if (this.cloudCover >= 0.8) {
      // Raining: cools down by 1°C per tick toward MIN_TEMP
      this.temperature = Math.max(TEMPERATURE_CONFIG.MIN_TEMP, this.temperature - 1);
    } else if (this.cloudCover <= 0.4) {
      // Clear/Sunny: warms up by 1°C per tick toward MAX_TEMP
      this.temperature = Math.min(TEMPERATURE_CONFIG.MAX_TEMP, this.temperature + 1);
    }

    // Over-speed wind tracking
    if (this.windIntensity >= WEATHER_CONFIG.WIND_HAZARD_THRESHOLD) {
      this.extremeWindTicks++;
    } else {
      this.extremeWindTicks = 0;
    }
  }

  stepMetric(currentVal) {
    const pull = (0.5 - currentVal) * WEATHER_CONFIG.MEAN_REVERSION_STRENGTH;
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

  getWeatherLabel() {
    const cloud = this.cloudCover <= 0.4 ? 'Sunny' : this.cloudCover <= 0.7 ? 'Cloudy' : 'Raining';
    const wind = this.windIntensity <= 0.2 ? 'Calm' : this.windIntensity <= 0.7 ? 'Breezy' : 'Gale Force';
    return `${cloud}, ${wind} (${this.temperature}°C)`;
  }
}
