export class WeatherOverlay {
  constructor() {
    this.rainParticles = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random(),
      length: 8 + Math.random() * 10,
      speed: 0.02 + Math.random() * 0.02,
    }));
    this.cloudOffset = 0;
  }

  draw(ctx, canvasWidth, canvasHeight, weatherManager) {
    if (!ctx || !weatherManager) return;

    ctx.save();

    // 1. Moving Cloud Shadow Blotches
    if (weatherManager.cloudCover >= 0.4) {
      this.cloudOffset += 0.3;
      const alpha = Math.min(0.25, (weatherManager.cloudCover - 0.3) * 0.35);

      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      const numBlobs = 5;
      for (let i = 0; i < numBlobs; i++) {
        const bx = ((this.cloudOffset * (i + 1) * 0.8) + i * (canvasWidth / numBlobs)) % (canvasWidth + 400) - 200;
        const by = (Math.sin(this.cloudOffset * 0.01 + i) * 80) + (i * 120) % canvasHeight;

        ctx.beginPath();
        if (typeof ctx.ellipse === 'function') {
          ctx.ellipse(bx, by, 180 + i * 30, 90 + i * 15, 0.2, 0, Math.PI * 2);
        } else {
          ctx.arc(bx, by, 120, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    // 2. Light Falling Rain Droplets
    if (weatherManager.cloudCover >= 0.75) {
      const rainIntensity = (weatherManager.cloudCover - 0.7) / 0.3; // 0.0 -> 1.0
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

        // Advance particles downwards
        p.y += p.speed;
        p.x -= p.speed * 0.2;
        if (p.y > 1.0) p.y = 0;
        if (p.x < 0) p.x = 1.0;
      }
    }

    ctx.restore();
  }
}
