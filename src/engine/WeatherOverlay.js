import { WEATHER_CONFIG } from '../config.js';

const CLOUD_WORLD_AREA_PER_BLOB = 700 * 700;
const CLOUD_MARGIN = 400;

export class WeatherOverlay {
  constructor() {
    this.rainParticles = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      length: 8 + Math.random() * 10,
      speed: 0.02 + Math.random() * 0.02,
    }));
    this.cloudOffset = 0;
    this.cloudBlobs = [];
    this.cloudWorldKey = '';
  }

  ensureCloudBlobs(worldW, worldH) {
    const key = `${worldW}x${worldH}`;
    if (this.cloudWorldKey === key) return;
    this.cloudWorldKey = key;
    const count = Math.max(5, Math.round((worldW * worldH) / CLOUD_WORLD_AREA_PER_BLOB));
    this.cloudBlobs = Array.from({ length: count }, () => ({
      x: Math.random() * (worldW + CLOUD_MARGIN * 2),
      y: Math.random() * worldH,
      rx: 160 + Math.random() * 120,
      ry: 80 + Math.random() * 60,
      speed: 0.6 + Math.random() * 0.6,
    }));
  }

  // Draw in world space (camera transform applied) so shadows stay fixed to the map while panning.
  drawClouds(ctx, mapLeft, mapTop, worldW, worldH, view, weatherManager, elapsedSeconds = 0) {
    if (!ctx || !weatherManager || weatherManager.cloudCover < 0.4) return;
    this.ensureCloudBlobs(worldW, worldH);
    this.cloudOffset += Math.max(0, elapsedSeconds) * 18;
    const alpha = Math.min(0.25, (weatherManager.cloudCover - 0.3) * 0.35);
    const wrapW = worldW + CLOUD_MARGIN * 2;

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (const blob of this.cloudBlobs) {
      const bx = mapLeft - CLOUD_MARGIN + ((blob.x + this.cloudOffset * blob.speed) % wrapW);
      const by = mapTop + blob.y;
      if (bx + blob.rx < view.left || bx - blob.rx > view.right || by + blob.ry < view.top || by - blob.ry > view.bottom) continue;
      ctx.beginPath();
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(bx, by, blob.rx, blob.ry, 0.2, 0, Math.PI * 2);
      } else {
        ctx.arc(bx, by, blob.rx, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  drawRain(ctx, canvasWidth, canvasHeight, weatherManager) {
    if (!ctx || !weatherManager || weatherManager.cloudCover <= WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD) return;

    ctx.save();
    const rainIntensity = (weatherManager.cloudCover - WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD) /
      (1 - WEATHER_CONFIG.RAIN_CLOUD_THRESHOLD);
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.45)';
    ctx.lineWidth = 1.2;

    const activeCount = Math.floor(this.rainParticles.length * rainIntensity);
    for (let i = 0; i < activeCount; i++) {
      const p = this.rainParticles[i];
      const px = p.x * canvasWidth;
      const py = p.y * canvasHeight;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 2, py + p.length);
      ctx.stroke();

      p.y += p.speed;
      p.x -= p.speed * 0.2;
      if (p.y > 1.0) p.y = 0;
      if (p.x < 0) p.x = 1.0;
    }
    ctx.restore();
  }
}
