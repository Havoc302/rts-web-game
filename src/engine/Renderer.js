import { TERRAIN, ZONE, DENSITY, PRODUCER_TYPE, PRODUCER_CONFIG, TILE_SIZE, ORE_CONFIG, NIGHT_TINT_ALPHA, RENDERER_CONFIG, POLLUTION_CONFIG } from '../config.js';

export class Renderer {
  constructor(canvas, grid) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = grid;

    this.cameraX = 40;
    this.cameraY = 40;
    this.zoom = RENDERER_CONFIG.DEFAULT_ZOOM;

    this.overlayMode = 'normal';
    this.selectedTile = null;
    this.hoverTile = null;
    this.highlightWaterAdjacent = false;

    this.animTime = 0;
    this.lastRenderTime = 0;
    this.terrainCache = null;
    this.terrainCacheVersion = -1;
  }

  setCamera(x, y, zoom = this.zoom) {
    this.cameraX = x;
    this.cameraY = y;
    this.zoom = Math.min(RENDERER_CONFIG.ZOOM_MAX, Math.max(RENDERER_CONFIG.ZOOM_MIN, zoom));
  }

  setOverlayMode(mode) {
    this.overlayMode = mode;
  }

  render(simulation) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.zoom < RENDERER_CONFIG.LOW_DETAIL_THRESHOLD && this.lastRenderTime > 0 && now - this.lastRenderTime < 33) return;
    const elapsed = this.lastRenderTime > 0 ? Math.min(RENDERER_CONFIG.DELTA_TIME_MAX, (now - this.lastRenderTime) / 1000) : 0;
    this.lastRenderTime = now;
    this.animTime += elapsed;

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
    const lowDetail = this.zoom < RENDERER_CONFIG.LOW_DETAIL_THRESHOLD;

    // Only visit tiles whose world-space bounds intersect the viewport.
    const visibleLeft = (-width / 2 - this.cameraX) / this.zoom;
    const visibleTop = (-height / 2 - this.cameraY) / this.zoom;
    const visibleRight = (width / 2 - this.cameraX) / this.zoom;
    const visibleBottom = (height / 2 - this.cameraY) / this.zoom;
    const startTileX = Math.max(0, Math.floor((visibleLeft - startX) / TILE_SIZE) - 1);
    const startTileY = Math.max(0, Math.floor((visibleTop - startY) / TILE_SIZE) - 1);
    const endTileX = Math.min(this.grid.width - 1, Math.ceil((visibleRight - startX) / TILE_SIZE) + 1);
    const endTileY = Math.min(this.grid.height - 1, Math.ceil((visibleBottom - startY) / TILE_SIZE) + 1);

    const terrainCacheReady = !lowDetail && this.ensureTerrainCache(mapPixelWidth, mapPixelHeight);
    if (terrainCacheReady) {
      const sourceX = startTileX * TILE_SIZE;
      const sourceY = startTileY * TILE_SIZE;
      const sourceWidth = (endTileX - startTileX + 1) * TILE_SIZE;
      const sourceHeight = (endTileY - startTileY + 1) * TILE_SIZE;
      ctx.drawImage(
        this.terrainCache,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        startX + sourceX,
        startY + sourceY,
        sourceWidth,
        sourceHeight,
      );
    }

    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        const tile = this.grid.tiles[y][x];
        const px = startX + x * TILE_SIZE;
        const py = startY + y * TILE_SIZE;

        if (!terrainCacheReady) {
          this.renderLowDetailTile(ctx, tile, px, py);
          continue;
        }

        if (lowDetail) {
          this.renderLowDetailTile(ctx, tile, px, py);
          continue;
        }

        if (tile.terrain === TERRAIN.WATER) {
          this.renderTerrainTile(ctx, tile, px, py);
        }

        if (tile.hasRoad && !tile.hasBridge) {
          this.renderRoadTile(ctx, tile, px, py);
        }

        if (tile.zone !== ZONE.NONE) {
          this.renderZoneTile(ctx, tile, px, py);
        }

        if (tile.producer) {
          this.renderProducerTile(ctx, tile, px, py);
        }

        if (tile.oreDiscovered || tile.surveyingBy) {
          this.renderSurveyStatus(ctx, tile, px, py);
        }

        if (tile.onFire) {
          this.renderFireTile(ctx, tile, px, py);
        }

        if (this.overlayMode !== 'normal') {
          this.renderOverlay(ctx, tile, px, py);
        }

        if (tile.destroyed) {
          this.renderDestroyedTile(ctx, px, py);
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

    if (simulation && !simulation.isDaytime()) {
      ctx.fillStyle = `rgba(2, 6, 23, ${NIGHT_TINT_ALPHA})`;
      ctx.fillRect(visibleLeft, visibleTop, visibleRight - visibleLeft, visibleBottom - visibleTop);
    }

    ctx.restore();
  }

  ensureTerrainCache(width, height) {
    if (this.terrainCache && this.terrainCacheVersion === this.grid.terrainVersion) return true;

    if (!this.terrainCache || this.terrainBuildVersion !== this.grid.terrainVersion) {
      this.terrainCache = document.createElement('canvas');
      this.terrainCache.width = width;
      this.terrainCache.height = height;
      this.terrainCacheContext = this.terrainCache.getContext('2d');
      this.terrainBuildVersion = this.grid.terrainVersion;
      this.terrainBuildIndex = 0;
    }

    const cacheContext = this.terrainCacheContext;
    const totalTiles = this.grid.width * this.grid.height;
    const buildBudget = RENDERER_CONFIG.TERRAIN_BUILD_BUDGET;
    const endIndex = Math.min(totalTiles, this.terrainBuildIndex + buildBudget);
    for (; this.terrainBuildIndex < endIndex; this.terrainBuildIndex++) {
      const x = this.terrainBuildIndex % this.grid.width;
      const y = Math.floor(this.terrainBuildIndex / this.grid.width);
      const tile = this.grid.tiles[y][x];
      this.renderTerrainTile(cacheContext, tile, x * TILE_SIZE, y * TILE_SIZE, false);
      cacheContext.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      cacheContext.lineWidth = 1;
      cacheContext.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    if (this.terrainBuildIndex < totalTiles) return false;
    this.terrainCacheVersion = this.grid.terrainVersion;
    return true;
  }

  renderLowDetailTile(ctx, tile, px, py) {
    if (tile.terrain === TERRAIN.WATER) {
      ctx.fillStyle = tile.isPolluted ? '#3f6212' : '#0369a1';
    } else if (tile.terrain === TERRAIN.FOREST) {
      ctx.fillStyle = '#064e3b';
    } else if (tile.terrain === TERRAIN.MOUNTAIN) {
      ctx.fillStyle = '#334155';
    } else {
      ctx.fillStyle = (tile.x + tile.y) % 2 === 0 ? '#5b4636' : '#463326';
    }
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    if (tile.zone !== ZONE.NONE) {
      ctx.fillStyle = tile.zone === ZONE.RESIDENTIAL ? '#10b98188' : tile.zone === ZONE.COMMERCIAL ? '#3b82f688' : '#f59e0b88';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    } else if (tile.hasRoad) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    } else if (tile.producer) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    if (tile.destroyed) {
      this.renderDestroyedTile(ctx, px, py);
    }
  }

  renderDestroyedTile(ctx, px, py) {
    ctx.fillStyle = 'rgba(31, 41, 55, 0.88)';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  renderTerrainTile(ctx, tile, px, py, animateWater = true) {
    if (tile.terrain === TERRAIN.FLAT) {
      const isAlt = (tile.x + tile.y) % 2 === 0;
      ctx.fillStyle = isAlt ? '#5b4636' : '#463326';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = isAlt ? '#6b5440' : '#533d2d';
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
      const wave = animateWater ? Math.sin(this.animTime * 3 - flowPos * 1.5) * 0.1 : 0;
      
      if (isPollutedWater) {
        const pollutionLevel = Math.min(1, (tile.riverPollution || 0) / POLLUTION_CONFIG.RIVER_POLLUTION_LEVEL_MAX_DISPLAY);
        ctx.fillStyle = pollutionLevel > POLLUTION_CONFIG.POLLUTION_DISPLAY_THRESHOLD
          ? (wave > 0 ? '#4d7c0f' : '#3f6212')
          : (wave > 0 ? '#65a30d' : '#4d7c0f');
      } else {
        ctx.fillStyle = wave > 0 ? '#0284c7' : '#0369a1';
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Directional flow animation using tile.riverFlowDir
      const cx = px + TILE_SIZE / 2;
      const cy = py + TILE_SIZE / 2;

      const flowSpeed = 20;
      const spatialOffset = Math.abs(tile.x * 13 + tile.y * 17);
      const phase = animateWater
        ? ((this.animTime * flowSpeed + spatialOffset) % TILE_SIZE + TILE_SIZE) % TILE_SIZE
        : spatialOffset % TILE_SIZE;
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

      if (tile.hasBridge) {
        this.renderBridgeTile(ctx, tile, px, py);
      }
    }
  }

  renderBridgeTile(ctx, tile, px, py) {
    const n = this.grid.getTile(tile.x, tile.y - 1)?.hasRoad;
    const e = this.grid.getTile(tile.x + 1, tile.y)?.hasRoad;
    const s = this.grid.getTile(tile.x, tile.y + 1)?.hasRoad;
    const w = this.grid.getTile(tile.x - 1, tile.y)?.hasRoad;

    // Structural base (concrete/steel frame)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 8, py + 8, 16, 16);
    if (n) ctx.fillRect(px + 8, py, 16, 8);
    if (e) ctx.fillRect(px + 24, py + 8, 8, 16);
    if (s) ctx.fillRect(px + 8, py + 24, 16, 8);
    if (w) ctx.fillRect(px, py + 8, 8, 16);

    // Asphalt deck
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 10, py + 10, 12, 12);
    if (n) ctx.fillRect(px + 10, py, 12, 10);
    if (e) ctx.fillRect(px + 22, py + 10, 10, 12);
    if (s) ctx.fillRect(px + 10, py + 22, 12, 10);
    if (w) ctx.fillRect(px, py + 10, 10, 12);

    // Guardrails / Metal caps
    ctx.fillStyle = '#cbd5e1';
    if ((n || s) && !e && !w) {
      // N-S Vertical Bridge Railings
      ctx.fillRect(px + 7, py, 3, TILE_SIZE);
      ctx.fillRect(px + 22, py, 3, TILE_SIZE);
    } else if ((e || w) && !n && !s) {
      // E-W Horizontal Bridge Railings
      ctx.fillRect(px, py + 7, TILE_SIZE, 3);
      ctx.fillRect(px, py + 22, TILE_SIZE, 3);
    } else {
      // Corner/Junction Railing Pillars
      if (!n) ctx.fillRect(px + 7, py + 7, 18, 3);
      if (!s) ctx.fillRect(px + 7, py + 22, 18, 3);
      if (!w) ctx.fillRect(px + 7, py + 7, 3, 18);
      if (!e) ctx.fillRect(px + 22, py + 7, 3, 18);
    }

    // Yellow centerline
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

  renderRoadTile(ctx, tile, px, py) {
    if (tile.hasTunnel) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px + 4, py + 8, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 7, Math.PI, 0);
      ctx.fill();
      return;
    }
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
    const serviceScale = prod.density === DENSITY.HIGH ? 1.18 : prod.density === DENSITY.MEDIUM ? 1.08 : 1;
    ctx.save();
    ctx.translate(px + TILE_SIZE / 2, py + TILE_SIZE / 2);
    ctx.scale(serviceScale, serviceScale);
    ctx.translate(-(px + TILE_SIZE / 2), -(py + TILE_SIZE / 2));
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
    } else if (prod.type === PRODUCER_TYPE.WINDMILL) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(px + 2, py + 2, 28, 28);

      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(px + 15, py + 14, 2, 16);

      const spin = this.animTime * 4;
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const angle = spin + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(px + 16, py + 12);
        ctx.lineTo(px + 16 + Math.cos(angle) * 9, py + 12 + Math.sin(angle) * 9);
        ctx.stroke();
      }
    } else if (prod.type === PRODUCER_TYPE.SOLAR_PANEL) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(px + 5, py + 5, 22, 22);
      ctx.fillStyle = '#60a5fa';
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillRect(px + 7 + c * 7, py + 7 + r * 7, 5, 5);
        }
      }
    } else if (prod.type === PRODUCER_TYPE.BATTERY) {
      ctx.fillStyle = '#166534';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px + 8, py + 6, 16, 20);
      ctx.fillRect(px + 13, py + 3, 6, 4);

      const pct = prod.maxStorage > 0 ? (prod.storedEnergy || 0) / prod.maxStorage : 0;
      ctx.fillStyle = '#bbf7d0';
      const fillHeight = Math.round(16 * pct);
      ctx.fillRect(px + 10, py + 24 - fillHeight, 12, fillHeight);
    } else if (prod.type === PRODUCER_TYPE.COAL_PLANT) {
      ctx.fillStyle = '#292524';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#57534e';
      ctx.fillRect(px + 21, py + 4, 6, 22);
      ctx.fillRect(px + 6, py + 12, 6, 14);

      const smokeOffset = (Math.sin(this.animTime * 2) * 3) | 0;
      ctx.fillStyle = 'rgba(120, 113, 108, 0.8)';
      ctx.beginPath();
      ctx.arc(px + 24 + smokeOffset, py + 3, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (prod.type === PRODUCER_TYPE.NUCLEAR_PLANT) {
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#84cc16';
      ctx.beginPath();
      ctx.arc(px + 12, py + 20, 8, Math.PI, 0);
      ctx.arc(px + 22, py + 20, 8, Math.PI, 0);
      ctx.fill();

      const puff = 1 + Math.sin(this.animTime * 1.5) * 0.2;
      ctx.fillStyle = 'rgba(236, 253, 245, 0.85)';
      ctx.beginPath();
      ctx.arc(px + 12, py + 8, 5 * puff, 0, Math.PI * 2);
      ctx.arc(px + 22, py + 8, 5 * puff, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1a2e05';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☢', px + 17, py + 24);
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
    } else if (prod.type === PRODUCER_TYPE.POLICE_STATION) {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(px + 6, py + 6, 20, 20);

      const isRed = Math.floor(this.animTime * 6) % 2 === 0;
      ctx.fillStyle = isRed ? '#ef4444' : '#38bdf8';
      ctx.fillRect(px + 13, py + 11, 6, 4);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('POL', px + 16, py + 20);
    } else if (prod.type === PRODUCER_TYPE.FIRE_STATION) {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 5, py + 5, 22, 22);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 8, py + 18, 6, 9);
      ctx.fillRect(px + 18, py + 18, 6, 9);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIRE', px + 16, py + 11);
    } else if (prod.type === PRODUCER_TYPE.HOSPITAL) {
      ctx.fillStyle = '#065f46';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(px + 5, py + 5, 22, 22);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 14, py + 9, 4, 14);
      ctx.fillRect(px + 9, py + 14, 14, 4);
    } else if (prod.type === PRODUCER_TYPE.SCHOOL) {
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px + 6, py + 6, 20, 20);

      ctx.fillStyle = '#78350f';
      ctx.fillRect(px + 13, py + 3, 6, 8);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 15, py + 5, 2, 2);
    } else if (prod.type === PRODUCER_TYPE.LIBRARY) {
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(px + 5, py + 5, 22, 22);

      ctx.fillStyle = '#ddd6fe';
      ctx.fillRect(px + 8, py + 9, 3, 14);
      ctx.fillRect(px + 14, py + 9, 3, 14);
      ctx.fillRect(px + 20, py + 9, 3, 14);
    } else if (prod.type === PRODUCER_TYPE.CITY_HALL) {
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(px + 4, py + 4, 24, 24);

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(px + 16, py + 14, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(px + 15, py + 2, 2, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 17, py + 2, 4, 3);
    } else if (prod.type === PRODUCER_TYPE.SURVEY_STATION) {
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#14b8a6';
      ctx.fillRect(px + 6, py + 15, 20, 11);
      ctx.fillStyle = '#ccfbf1';
      ctx.fillRect(px + 14, py + 6, 4, 14);
      ctx.beginPath();
      ctx.arc(px + 16, py + 6, 5, Math.PI, 0);
      ctx.strokeStyle = '#ccfbf1';
      ctx.lineWidth = 2;
      ctx.stroke();

    } else {
      ctx.fillStyle = PRODUCER_CONFIG[prod.type]?.color || '#64748b';
      ctx.fillRect(px + 2, py + 2, 28, 28);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((PRODUCER_CONFIG[prod.type]?.name || prod.type).slice(0, 5).toUpperCase(), px + 16, py + 16);
    }

    ctx.restore();

    const hasRoad = this.grid.isRoadAdjacent(tile.x, tile.y);
    const isBatteryDependent = prod.type === PRODUCER_TYPE.WINDMILL || prod.type === PRODUCER_TYPE.SOLAR_PANEL;
    if (!hasRoad && !isBatteryDependent) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 2, py + 2, 10, 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', px + 7, py + 7);
    } else if (prod.type === PRODUCER_TYPE.SURVEY_STATION && !prod.operational) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px + 2, py + 2, 10, 10);
      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('U', px + 7, py + 7);
    }
  }

  renderSurveyStatus(ctx, tile, px, py) {
    if (tile.surveyingBy) {
      const progress = tile.surveyRequired > 0 ? tile.surveyProgress / tile.surveyRequired : 0;
      ctx.fillStyle = 'rgba(20, 184, 166, 0.85)';
      ctx.fillRect(px + 3, py + 26, (TILE_SIZE - 6) * progress, 3);
      return;
    }

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 25, py + 3);
    ctx.lineTo(px + 29, py + 7);
    ctx.moveTo(px + 29, py + 3);
    ctx.lineTo(px + 25, py + 7);
    ctx.stroke();
  }

  renderFireTile(ctx, tile, px, py) {
    const flicker = 0.55 + 0.35 * Math.abs(Math.sin(this.animTime * 6 + (tile.x + tile.y)));
    ctx.fillStyle = `rgba(249, 115, 22, ${0.5 + 0.2 * flicker})`;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Pulsing smoke particles
    const smokeCount = 3;
    for (let i = 0; i < smokeCount; i++) {
      const phase = this.animTime * 1.5 + i * 2.1 + (tile.x * 3 + tile.y * 7);
      const riseFrac = (phase % 2) / 2;
      const sx = px + TILE_SIZE / 2 + Math.sin(phase) * 6;
      const sy = py + TILE_SIZE * (0.8 - riseFrac * 0.7);
      const alpha = (1 - riseFrac) * 0.35;
      ctx.fillStyle = `rgba(100, 116, 139, ${alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + riseFrac * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tile.fireDamage > 0) {
      const pct = Math.min(1, tile.fireDamage / 100);
      const barWidth = TILE_SIZE - 6;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(px + 3, py + TILE_SIZE - 6, barWidth, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 3, py + TILE_SIZE - 6, barWidth * pct, 3);
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

    if (this.overlayMode === 'crime') {
      if (tile.crime > 0) {
        const intensity = Math.min(1, tile.crime / 10);
        ctx.fillStyle = `rgba(225, 29, 72, ${0.15 + intensity * 0.55})`;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = '#fecdd3';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${tile.crime}`, px + 16, py + 16);
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
    } else if (this.overlayMode === 'police') {
      dist = tile.serviceDistances?.police ?? Infinity;
      color = '59, 130, 246';
    } else if (this.overlayMode === 'fire') {
      dist = tile.serviceDistances?.fire ?? Infinity;
      color = '239, 68, 68';
    } else if (this.overlayMode === 'hospital') {
      dist = tile.serviceDistances?.hospital ?? Infinity;
      color = '16, 185, 129';
    } else if (this.overlayMode === 'school') {
      dist = tile.serviceDistances?.school ?? Infinity;
      color = '245, 158, 11';
    } else if (this.overlayMode === 'library') {
      dist = tile.serviceDistances?.library ?? Infinity;
      color = '139, 92, 246';
    } else if (this.overlayMode === 'city_hall') {
      dist = tile.serviceDistances?.cityHall ?? Infinity;
      color = '234, 179, 8';
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
