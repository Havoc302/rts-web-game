import { TERRAIN, ZONE, DENSITY, PRODUCER_TYPE, TILE_SIZE } from '../config.js';

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = grid;

    this.cameraX = 40;
    this.cameraY = 40;
    this.zoom = 1.0;

    this.overlayMode = 'normal';
    this.selectedTile = null;
    this.hoverTile = null;
    this.highlightWaterAdjacent = false;

    this.animTime = 0;
  }

  setCamera(x, y, zoom = this.zoom) {
    this.cameraX = x;
    this.cameraY = y;
    this.zoom = Math.min(2.5, Math.max(0.4, zoom));
  }

  setOverlayMode(mode) {
    this.overlayMode = mode;
  }

  render(simulation) {
    this.animTime += 0.05;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + this.cameraX, height / 2 + this.cameraY);
    ctx.scale(this.zoom, this.zoom);

    const mapPixelWidth = this.grid.width * TILE_SIZE;
    const mapPixelHeight = this.grid.height * TILE_SIZE;
    const startX = -mapPixelWidth / 2;
    const startY = -mapPixelHeight / 2;

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);
        const px = startX + x * TILE_SIZE;
        const py = startY + y * TILE_SIZE;

        this.renderTerrainTile(ctx, tile, px, py);

        if (tile.hasRoad) {
          this.renderRoadTile(ctx, tile, px, py);
        }

        if (tile.zone !== ZONE.NONE) {
          this.renderZoneTile(ctx, tile, px, py);
        }

        if (tile.producer) {
          this.renderProducerTile(ctx, tile, px, py);
        }

        if (this.overlayMode !== 'normal') {
          this.renderOverlay(ctx, tile, px, py);
        }

        if (this.highlightWaterAdjacent && tile.terrain === TERRAIN.FLAT && this.grid.isWaterAdjacent(x, y) && !tile.producer && !tile.hasRoad && tile.zone === ZONE.NONE) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        this.renderShortfallIndicators(ctx, tile, px, py);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
      }
    }

    if (this.hoverTile) {
      const hx = startX + this.hoverTile.x * TILE_SIZE;
      const hy = startY + this.hoverTile.y * TILE_SIZE;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    if (this.selectedTile) {
      const sx = startX + this.selectedTile.x * TILE_SIZE;
      const sy = startY + this.selectedTile.y * TILE_SIZE;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
    }

    ctx.restore();
  }

  renderTerrainTile(ctx, tile, px, py) {
    if (tile.terrain === TERRAIN.FLAT) {
      const isAlt = (tile.x + tile.y) % 2 === 0;
      ctx.fillStyle = isAlt ? '#1e293b' : '#172033';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = isAlt ? '#24334a' : '#1d2a3f';
      ctx.fillRect(px + 4, py + 4, 3, 3);
      ctx.fillRect(px + 18, py + 22, 2, 2);
    } else if (tile.terrain === TERRAIN.MOUNTAIN) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 4);
      ctx.lineTo(px + 28, py + 28);
      ctx.lineTo(px + 4, py + 28);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 4);
      ctx.lineTo(px + 20, py + 12);
      ctx.lineTo(px + 12, py + 12);
      ctx.closePath();
      ctx.fill();
    } else if (tile.terrain === TERRAIN.FOREST) {
      const isAlt = (tile.x + tile.y) % 2 === 0;
      ctx.fillStyle = isAlt ? '#064e3b' : '#022c22';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.arc(px + 10, py + 12, 6, 0, Math.PI * 2);
      ctx.arc(px + 22, py + 10, 7, 0, Math.PI * 2);
      ctx.arc(px + 16, py + 20, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(px + 10, py + 12, 4, 0, Math.PI * 2);
      ctx.arc(px + 22, py + 10, 5, 0, Math.PI * 2);
      ctx.arc(px + 16, py + 20, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (tile.terrain === TERRAIN.WATER) {
      const isPollutedWater = tile.isPolluted === true;
      const dir = tile.riverFlowDir || { x: 0, y: 1 };
      const flowPos = tile.x * dir.x + tile.y * dir.y;
      const wave = Math.sin(this.animTime * 3 - flowPos * 1.5) * 0.1;
      
      if (isPollutedWater) {
        ctx.fillStyle = wave > 0 ? '#4d7c0f' : '#3f6212';
      } else {
        ctx.fillStyle = wave > 0 ? '#0284c7' : '#0369a1';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Directional flow animation using tile.riverFlowDir
      const cx = px + TILE_SIZE / 2;
      const cy = py + TILE_SIZE / 2;

      const flowSpeed = 20;
      const spatialOffset = Math.abs(tile.x * 13 + tile.y * 17);
      const phase = ((this.animTime * flowSpeed + spatialOffset) % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
      const posOffset = phase - TILE_SIZE / 2;

      const ax = cx + dir.x * posOffset;
      const ay = cy + dir.y * posOffset;

      // Draw chevron pointing in flow direction
      const perpX = -dir.y;
      const perpY = dir.x;

      ctx.strokeStyle = isPollutedWater ? 'rgba(163, 230, 53, 0.5)' : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax - dir.x * 3 + perpX * 5, ay - dir.y * 3 + perpY * 5);
      ctx.lineTo(ax + dir.x * 4, ay + dir.y * 4);
      ctx.lineTo(ax - dir.x * 3 - perpX * 5, ay - dir.y * 3 - perpY * 5);
      ctx.stroke();
    }
  }

  renderRoadTile(ctx, tile, px, py) {
    const n = this.grid.getTile(tile.x, tile.y - 1)?.hasRoad;
    const e = this.grid.getTile(tile.x + 1, tile.y)?.hasRoad;
    const s = this.grid.getTile(tile.x, tile.y + 1)?.hasRoad;
    const w = this.grid.getTile(tile.x - 1, tile.y)?.hasRoad;

    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 10, py + 10, 12, 12);

    if (n) ctx.fillRect(px + 10, py, 12, 10);
    if (e) ctx.fillRect(px + 22, py + 10, 10, 12);
    if (s) ctx.fillRect(px + 10, py + 22, 12, 10);
    if (w) ctx.fillRect(px, py + 10, 10, 12);

    ctx.fillStyle = '#fef08a';
    if ((n || s) && !e && !w) {
      ctx.fillRect(px + 15, py + 4, 2, 6);
      ctx.fillRect(px + 15, py + 22, 2, 6);
    } else if ((e || w) && !n && !s) {
      ctx.fillRect(px + 4, py + 15, 6, 2);
      ctx.fillRect(px + 22, py + 15, 6, 2);
    } else {
      ctx.fillRect(px + 15, py + 15, 2, 2);
    }
  }

  renderZoneTile(ctx, tile, px, py) {
    let baseColor = '#10b981';
    if (tile.zone === ZONE.RESIDENTIAL) baseColor = '#10b981';
    else if (tile.zone === ZONE.COMMERCIAL) baseColor = '#3b82f6';
    else if (tile.zone === ZONE.INDUSTRIAL) baseColor = '#f59e0b';

    ctx.fillStyle = baseColor + '33';
    ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.strokeStyle = baseColor + '88';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    if (tile.zone === ZONE.RESIDENTIAL) {
      this.renderResidentialArt(ctx, tile.density, px, py);
    } else if (tile.zone === ZONE.COMMERCIAL) {
      this.renderCommercialArt(ctx, tile.density, px, py);
    } else if (tile.zone === ZONE.INDUSTRIAL) {
      this.renderIndustrialArt(ctx, tile.density, px, py);
    }
  }

  renderResidentialArt(ctx, density, px, py) {
    if (density === DENSITY.LIGHT) {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(px + 5, py + 6, 9, 8);
      ctx.fillRect(px + 18, py + 16, 9, 8);

      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 6);
      ctx.lineTo(px + 9.5, py + 2);
      ctx.lineTo(px + 15, py + 6);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(px + 17, py + 16);
      ctx.lineTo(px + 22.5, py + 12);
      ctx.lineTo(px + 28, py + 16);
      ctx.fill();
    } else if (density === DENSITY.MEDIUM) {
      ctx.fillStyle = '#059669';
      ctx.fillRect(px + 4, py + 4, 11, 24);
      ctx.fillRect(px + 17, py + 8, 11, 20);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 6, py + 7, 3, 4);
      ctx.fillRect(px + 11, py + 7, 3, 4);
      ctx.fillRect(px + 6, py + 14, 3, 4);
      ctx.fillRect(px + 11, py + 14, 3, 4);
      ctx.fillRect(px + 19, py + 12, 3, 4);
      ctx.fillRect(px + 24, py + 12, 3, 4);
    } else {
      ctx.fillStyle = '#047857';
      ctx.fillRect(px + 4, py + 2, 24, 28);
      ctx.fillStyle = '#065f46';
      ctx.fillRect(px + 8, py + 4, 16, 24);

      ctx.fillStyle = '#6ee7b7';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillRect(px + 10 + c * 5, py + 6 + r * 5, 3, 3);
        }
      }
    }
  }

  renderCommercialArt(ctx, density, px, py) {
    if (density === DENSITY.LIGHT) {
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(px + 5, py + 8, 22, 18);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 4, py + 6, 24, 4);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(px + 8, py + 12, 6, 8);
      ctx.fillRect(px + 18, py + 12, 6, 8);
    } else if (density === DENSITY.MEDIUM) {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(px + 4, py + 4, 24, 24);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(px + 8, py + 2, 16, 4);

      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(px + 7, py + 8, 18, 5);
      ctx.fillRect(px + 7, py + 16, 18, 5);
    } else {
      ctx.fillStyle = '#1e40af';
      ctx.fillRect(px + 6, py + 2, 20, 28);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(px + 9, py + 4, 14, 24);

      ctx.fillStyle = '#bfdbfe';
      ctx.fillRect(px + 11, py + 6, 10, 20);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(px + 15, py + 6, 2, 20);
    }
  }

  renderIndustrialArt(ctx, density, px, py) {
    if (density === DENSITY.LIGHT) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(px + 4, py + 10, 16, 16);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 22, py + 6, 5, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px + 21, py + 2, 7, 4);
    } else if (density === DENSITY.MEDIUM) {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(px + 4, py + 6, 24, 20);
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 6);
      ctx.lineTo(px + 10, py + 2);
      ctx.lineTo(px + 16, py + 6);
      ctx.lineTo(px + 22, py + 2);
      ctx.lineTo(px + 28, py + 6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(px + 2, py + 4, 28, 24);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 5, py + 8, 8, 16);
      ctx.fillRect(px + 19, py + 8, 8, 16);

      const smokeOffset = (Math.sin(this.animTime * 2) * 3) | 0;
      ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
      ctx.beginPath();
      ctx.arc(px + 9 + smokeOffset, py + 2, 4, 0, Math.PI * 2);
      ctx.arc(px + 23 - smokeOffset, py + 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderProducerTile(ctx, tile, px, py) {
    const prod = tile.producer;
    if (prod.type === PRODUCER_TYPE.POWER_PLANT) {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px + 6, py + 6, 20, 20);

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 12);
      ctx.lineTo(px + 14, py + 17);
      ctx.lineTo(px + 17, py + 17);
      ctx.lineTo(px + 15, py + 21);
      ctx.lineTo(px + 18, py + 15);
      ctx.lineTo(px + 15, py + 15);
      ctx.closePath();
      ctx.fill();
    } else if (prod.type === PRODUCER_TYPE.WATER_TOWER) {
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(px + 14, py + 14, 4, 0, Math.PI * 2);
      ctx.fill();

      if (prod.contaminated) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(px + 24, py + 8, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☣', px + 24, py + 8);
      }
    } else if (prod.type === PRODUCER_TYPE.SEWAGE_PLANT) {
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(px + 6, py + 6, 9, 9);
      ctx.fillRect(px + 17, py + 6, 9, 9);
      ctx.fillRect(px + 6, py + 17, 9, 9);
      ctx.fillRect(px + 17, py + 17, 9, 9);
    }

    const hasRoad = this.grid.isRoadAdjacent(tile.x, tile.y);
    if (!hasRoad) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 2, py + 2, 10, 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', px + 7, py + 7);
    }
  }

  renderShortfallIndicators(ctx, tile, px, py) {
    if (tile.zone === ZONE.NONE) return;

    if (tile.shortfall.sewage) {
      ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }

    const isConnected = this.grid.isRoadAdjacent(tile.x, tile.y);
    if (!isConnected) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 2, py + 2, 6, 6);
      return;
    }

    let offset = 2;
    const alpha = Math.sin(this.animTime * 4) > 0 ? 'ff' : '88';

    if (tile.shortfall.power) {
      ctx.fillStyle = '#f59e0b' + alpha;
      ctx.beginPath();
      ctx.arc(px + offset + 3, py + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      offset += 8;
    }

    if (tile.shortfall.water) {
      ctx.fillStyle = '#38bdf8' + alpha;
      ctx.beginPath();
      ctx.arc(px + offset + 3, py + 4, 3, 0, Math.PI * 2);
      ctx.fill();
      offset += 8;
    }

    if (tile.shortfall.sewage) {
      ctx.fillStyle = '#a855f7' + alpha;
      ctx.beginPath();
      ctx.arc(px + offset + 3, py + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderOverlay(ctx, tile, px, py) {
    if (this.overlayMode === 'pollution') {
      if (tile.pollution > 0) {
        const intensity = Math.min(1, tile.pollution / 15);
        ctx.fillStyle = `rgba(180, 83, 9, ${0.15 + intensity * 0.55})`;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = '#fef08a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${tile.pollution}`, px + 16, py + 16);
      }
      return;
    }

    let dist = Infinity;
    let color = '#ffffff';

    if (this.overlayMode === 'power') {
      dist = tile.distanceToProducer.power;
      color = '245, 158, 11';
    } else if (this.overlayMode === 'water') {
      dist = tile.distanceToProducer.water;
      color = '56, 189, 248';
    } else if (this.overlayMode === 'sewage') {
      dist = tile.distanceToProducer.sewage;
      color = '168, 85, 247';
    }

    if (dist < Infinity) {
      const alpha = Math.max(0.15, 0.7 - dist * 0.05);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      if (tile.hasRoad) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${dist}`, px + 16, py + 16);
      }
    } else if (tile.zone !== ZONE.NONE) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }
}
