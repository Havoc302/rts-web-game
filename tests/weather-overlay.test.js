import assert from 'assert';
import { WeatherOverlay } from '../src/engine/WeatherOverlay.js';
import { WEATHER_CONFIG } from '../src/config.js';

function createContext() {
  let strokes = 0;
  return {
    get strokes() { return strokes; },
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { strokes++; },
    fill() {},
    ellipse() {},
  };
}

{
  const overlay = new WeatherOverlay();
  const context = createContext();
  const weather = { cloudCover: WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD + 0.02 };
  overlay.drawRain(context, 100, 100, weather);
  assert.ok(context.strokes > 0, 'Rain visuals should appear above the shared gameplay rain threshold');
}

{
  const overlay = new WeatherOverlay();
  overlay.ensureCloudBlobs = () => { overlay.cloudBlobs = []; };
  const context = createContext();
  const weather = { cloudCover: 0.5 };
  const view = { left: 0, top: 0, right: 100, bottom: 100 };
  overlay.drawClouds(context, 0, 0, 100, 100, view, weather, 1 / 60);
  const afterOneFrame = overlay.cloudOffset;
  overlay.drawClouds(context, 0, 0, 100, 100, view, weather, 1 / 144);
  assert.ok(Math.abs((overlay.cloudOffset - afterOneFrame) - (18 / 144)) < 1e-12,
    'Cloud movement should scale with elapsed time rather than frame count');
}

console.log('Weather overlay tests passed.');