import { Grid } from './engine/Grid.js';
import { Simulation } from './engine/Simulation.js';
import { Renderer } from './engine/Renderer.js';
import { UtilityManager } from './engine/UtilityManager.js';
import { getProducerConnectionStatus, getTileUtilityStatus, formatProducerCapacity } from './engine/InspectorStatus.js';
import {
  applyHudSnapshot,
  buildHudSnapshot,
  buildInspectorSignature,
  changedHudFields,
  createUiTimingBucket,
  getHudCadenceMs,
  recordUiTiming,
  shouldRefreshUi,
  uiTimingAverages,
} from './engine/UiRefresh.js';
import { deserializeGameFromJson, serializeGameToJson } from './engine/SaveGame.js';
import { APP_VERSION, ZONE, TERRAIN, PRODUCER_TYPE, PRODUCER_CONFIG, FACTORY_RECIPES, COSTS, TILE_SIZE, STARTING_TREASURY, RESIDENTIAL_CAPACITY, JOBS_PROVIDED, FOREST_POLLUTION_ABSORPTION, FOREST_DESIRABILITY_RADIUS, CRIME_CONFIG, MEDICAL_CONFIG, POWER_PRODUCER_TYPES, POLLUTION_CONFIG, COAL_CONFIG, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, DENSITY, RENDERER_CONFIG, TERRAIN_GENERATION_CONFIG, MAP_SEED_STORAGE_KEY, splitDemographics } from './config.js';

const nowMs = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.grid = new Grid();
    this.simulation = new Simulation(this.grid);
    this.renderer = new Renderer(this.canvas, this.grid);
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    if (stylesheet) {
      const href = new URL(stylesheet.href, window.location.href);
      href.searchParams.set('v', APP_VERSION);
      stylesheet.href = href.toString();
    }

    this.treasury = STARTING_TREASURY;
    this.activeTool = 'pan';
    this.autoSwitchToPan = false;
    this.isMouseDown = false;
    this.isRightMouseDown = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.lastTouchX = 0;
    this.lastTouchY = 0;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchMoved = false;

    this.simInterval = null;
    this._hudSnapshot = null;
    this._hudAppliedAt = null;
    this._pendingHud = false;
    this._inspectorSignature = '';
    this._inspectorTile = null;
    this._inspectorAppliedAt = null;
    this._pendingInspectorTile = null;
    this.hudTiming = createUiTimingBucket();
    this.inspectorTiming = createUiTimingBucket();
    this.enableUiTiming = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugTiming');
    if (this.enableUiTiming) {
      this.simulation.enableTiming = true;
      this.renderer.enableTiming = true;
    }

    this.initCanvasSize();
    this.bindUIEvents();
    this.bindCanvasEvents();

    this.setSpeed(0);
    this.startRenderLoop();
  }

  initCanvasSize() {
    const resize = () => {
      this.canvas.width = this.canvas.parentElement.clientWidth;
      this.canvas.height = this.canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  bindUIEvents() {
    const autoPanToggle = document.getElementById('auto-pan-toggle');
    if (autoPanToggle) {
      this.autoSwitchToPan = this.isMobileLayout() && autoPanToggle.checked;
      autoPanToggle.addEventListener('change', () => {
        this.autoSwitchToPan = this.isMobileLayout() && autoPanToggle.checked;
      });
    }

    const toolDrawer = document.querySelector('.tool-drawer');
    const utilityHud = document.querySelector('.utility-hud');
    document.getElementById('btn-toggle-tools')?.addEventListener('click', () => {
      toolDrawer?.classList.toggle('mobile-open');
      utilityHud?.classList.remove('mobile-open');
    });
    document.getElementById('btn-toggle-hud')?.addEventListener('click', () => {
      utilityHud?.classList.toggle('mobile-open');
      toolDrawer?.classList.remove('mobile-open');
    });

    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.setActiveTool(btn.dataset.tool);
      });
    });

    document.querySelectorAll('.overlay-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.overlay-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderer.setOverlayMode(btn.dataset.mode);
      });
    });

    document.querySelectorAll('[data-hud-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-hud-tab]').forEach((tab) => tab.classList.toggle('active', tab === btn));
        document.querySelectorAll('.utility-hud-tab').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.hudPanel === btn.dataset.hudTab);
        });
      });
    });

    document.getElementById('btn-pause').addEventListener('click', () => this.setSpeed(0));
    document.getElementById('btn-speed-1').addEventListener('click', () => this.setSpeed(1));
    document.getElementById('btn-speed-2').addEventListener('click', () => this.setSpeed(2));
    document.getElementById('btn-speed-5').addEventListener('click', () => this.setSpeed(5));

    document.querySelectorAll('[data-service-budget]').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const budget = parseInt(e.target.value, 10);
        const type = e.target.dataset.serviceBudget;
        this.grid.producers
          .filter((producer) => producer.type === type || (type === 'hospital' && producer.type === 'clinic'))
          .forEach((producer) => { producer.budget = budget; });
        const value = document.getElementById(`${type}-budget-value`);
        if (value) value.textContent = `${budget}%`;
        this.simulation.computeStats();
        this.updateHUD({ force: true });
      });
    });

    const pensionSlider = document.getElementById('pension-budget-slider');
    if (pensionSlider) {
      pensionSlider.addEventListener('input', (e) => {
        const budget = parseInt(e.target.value, 10);
        this.simulation.pensionBudget = budget;
        const value = document.getElementById('pension-budget-value');
        if (value) value.textContent = `${budget}%`;
        this.simulation.computeStats();
        this.updateHUD({ force: true });
      });
    }

    const taxSlider = document.getElementById('tax-slider');
    if (taxSlider) {
      taxSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.simulation.taxRate = val;
        document.getElementById('tax-rate-val').textContent = val;
        this.simulation.computeStats();
        this.updateHUD({ force: true });
      });
    }

    const seedInput = document.getElementById('seed-input');
    if (seedInput) {
      seedInput.value = this.grid.seed;
      const triggerSeedReset = () => {
        const rawVal = seedInput.value;
        let val = parseInt(rawVal, 10);
        if (isNaN(val) || val <= 0) val = 12345;
        this.resetMapWithSeed(val);
      };
      seedInput.addEventListener('change', triggerSeedReset);
      seedInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerSeedReset();
      });
    }

    const resetBtn = document.getElementById('btn-reset-map');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const inputEl = document.getElementById('seed-input');
        let val = parseInt(inputEl?.value, 10);
        if (isNaN(val) || val <= 0) val = this.grid.seed;
        this.resetMapWithSeed(val);
      });
    }

    const regenBtn = document.getElementById('btn-regen-map');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        const newSeed = Math.floor(Math.random() * TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MAX) + TERRAIN_GENERATION_CONFIG.RANDOM_SEED_MIN;
        this.resetMapWithSeed(newSeed);
      });
    }

    document.getElementById('btn-save-game')?.addEventListener('click', () => this.saveGameToFile());
    document.getElementById('btn-export-game')?.addEventListener('click', () => this.exportGameToFile());
    document.getElementById('btn-load-game')?.addEventListener('click', () => document.getElementById('game-file-input')?.click());
    document.getElementById('game-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.importGameFile(file);
      e.target.value = '';
    });
  }

  resetMapWithSeed(seed) {
    const validSeed = parseInt(seed, 10) || this.grid.seed;
    this.grid.randomizeGrid(validSeed);

    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = this.grid.seed;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MAP_SEED_STORAGE_KEY, this.grid.seed);
    }
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', this.grid.seed);
      window.history.replaceState({}, '', url.toString());
    }

    this.simulation.tickCount = 0;
    this.simulation.computeStats();
    this.renderer.selectedTile = null;
    this.renderer.hoverTile = null;
    this.updateHUD({ force: true });
    this.renderer.render(this.simulation);
  }

  saveGameToFile() {
    if (!this.simulation.isPaused) {
      window.alert('Pause the game before saving.');
      return;
    }
    this.exportGameToFile();
  }

  exportGameToFile() {
    if (!this.simulation.isPaused) {
      window.alert('Pause the game before exporting a save.');
      return;
    }
    const blob = new Blob([serializeGameToJson(this)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bc2000-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async importGameFile(file) {
    try {
      const imported = deserializeGameFromJson(await file.text());
      this.setSpeed(0);
      this.grid = imported.grid;
      this.simulation.grid = this.grid;
      this.simulation.tickCount = imported.simulation.tickCount;
      this.simulation.speed = 0;
      this.simulation.isPaused = true;
      this.simulation.taxRate = imported.simulation.taxRate;
      this.simulation.pensionBudget = imported.simulation.pensionBudget;
      this.simulation.resourceManager.stockpile = imported.simulation.stockpile;
      this.simulation.resourceManager.capacity = imported.simulation.capacity;
      this.treasury = imported.treasury;
      this.renderer.grid = this.grid;
      this.renderer.terrainChunks = [];
      this.renderer.terrainChunksVersion = -1;
      this.renderer.setCamera(imported.camera.x, imported.camera.y, imported.camera.zoom);
      this.autoSwitchToPan = imported.ui.autoSwitchToPan;
      this.setActiveTool(imported.ui.activeTool);
      this.renderer.setOverlayMode(imported.ui.overlayMode);
      document.querySelectorAll('.overlay-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === imported.ui.overlayMode));
      this.simulation.stats = imported.simulation.stats;
      this.updateHUD({ force: true });
      this.renderer.render(this.simulation);
    } catch (error) {
      window.alert(`Unable to load save: ${error.message}`);
    }
  }

  setSpeed(speed) {
    document.querySelectorAll('.speed-controls .btn-icon').forEach((b) => b.classList.remove('active'));
    if (speed === 0) {
      document.getElementById('btn-pause').classList.add('active');
      this.simulation.isPaused = true;
      if (this.simInterval) clearInterval(this.simInterval);
      this.simInterval = null;
    } else {
      const id = speed === 1 ? 'btn-speed-1' : speed === 2 ? 'btn-speed-2' : 'btn-speed-5';
      document.getElementById(id).classList.add('active');
      this.simulation.isPaused = false;
      this.simulation.speed = speed;
      if (this.simInterval) clearInterval(this.simInterval);
      this.simInterval = setInterval(() => this.simTick(), 2000 / speed);
    }
  }

  simTick() {
    if (this.simulation.isPaused) return;
    const income = this.simulation.tick(true, this.treasury);
    this.treasury += income - this.simulation.stats.serviceExpenses - this.simulation.stats.roadExpenses - (this.simulation.surveyExpenses || 0);
    this.updateHUD();
    if (this.renderer.selectedTile) {
      this.updateInspector(this.renderer.selectedTile);
    }
  }

  updateHUD({ force = false } = {}) {
    const started = this.enableUiTiming ? nowMs() : 0;
    const snapshot = buildHudSnapshot(this.simulation, this.treasury);
    const changed = changedHudFields(this._hudSnapshot, snapshot);
    const cadenceMs = getHudCadenceMs(this.isMobileLayout());
    const at = nowMs();
    if (!shouldRefreshUi({ force, fieldCount: changed.length, now: at, lastAppliedAt: this._hudAppliedAt, cadenceMs })) {
      this._pendingHud = changed.length > 0;
      recordUiTiming(this.hudTiming, this.enableUiTiming ? nowMs() - started : 0, false);
      return false;
    }
    applyHudSnapshot(snapshot, changed, document);
    this._hudSnapshot = snapshot;
    this._hudAppliedAt = at;
    this._pendingHud = false;
    recordUiTiming(this.hudTiming, this.enableUiTiming ? nowMs() - started : 0, true);
    return true;
  }

  setActiveTool(tool) {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');
    this.activeTool = tool;
    const overlayMode = tool === 'survey' ? 'survey' : 'normal';
    document.querySelectorAll('.overlay-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === overlayMode));
    this.renderer.setOverlayMode(overlayMode);
    this.renderer.highlightWaterAdjacent =
      this.activeTool === 'producer_water' || this.activeTool === 'producer_sewage';
    if (this.activeTool !== 'inspect' && this.activeTool !== 'pan') {
      document.getElementById('inspector-panel').classList.remove('visible');
      this.renderer.selectedTile = null;
    }
    this.updateBuildInfoPanel(this.activeTool);
    // On mobile, close the off-canvas tool drawer once a tool is picked so the map is visible again.
    document.querySelector('.tool-drawer')?.classList.remove('mobile-open');
  }

  bindCanvasEvents() {
    const REPEATABLE_DRAG_TOOLS = new Set([
      'road', 'bridge', 'tunnel',
      'zone_r', 'zone_c', 'zone_i', 'zone_a',
      'bulldoze',
    ]);

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.isRightMouseDown = true;
      } else if (e.button === 0) {
        this.isMouseDown = true;
        this.mouseDownStartX = e.clientX;
        this.mouseDownStartY = e.clientY;
        this.mouseHasDragged = false;
        if (this.activeTool !== 'pan') {
          this.handleCanvasClick(e);
        }
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.isRightMouseDown = false;
      if (e.button === 0) {
        if (this.isMouseDown && this.activeTool === 'pan' && !this.mouseHasDragged) {
          this.handleCanvasClick(e);
        }
        this.isMouseDown = false;
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.isRightMouseDown || (this.isMouseDown && this.activeTool === 'pan')) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.renderer.setCamera(this.renderer.cameraX + dx, this.renderer.cameraY + dy);
        if (Math.hypot(e.clientX - this.mouseDownStartX, e.clientY - this.mouseDownStartY) > 5) {
          this.mouseHasDragged = true;
        }
      } else {
        const tile = this.screenToTile(mouseX, mouseY);
        this.renderer.hoverTile = tile;
        if (this.isMouseDown && REPEATABLE_DRAG_TOOLS.has(this.activeTool)) {
          this.handleCanvasClick(e);
        }
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const oldZoom = this.renderer.zoom;
      const worldX = (mouseX - this.canvas.width / 2 - this.renderer.cameraX) / oldZoom;
      const worldY = (mouseY - this.canvas.height / 2 - this.renderer.cameraY) / oldZoom;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(RENDERER_CONFIG.ZOOM_MAX, Math.max(RENDERER_CONFIG.ZOOM_MIN, oldZoom * zoomFactor));

      const newCameraX = mouseX - this.canvas.width / 2 - worldX * newZoom;
      const newCameraY = mouseY - this.canvas.height / 2 - worldY * newZoom;

      this.renderer.setCamera(newCameraX, newCameraY, newZoom);
    });

    // Touch support: single-finger drag always pans the camera (never builds),
    // and a tap that didn't move performs the active tool's action.
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      this.touchMoved = false;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.lastTouchX;
      const dy = touch.clientY - this.lastTouchY;
      this.renderer.setCamera(this.renderer.cameraX + dx, this.renderer.cameraY + dy);

      const totalDx = touch.clientX - this.touchStartX;
      const totalDy = touch.clientY - this.touchStartY;
      if (Math.hypot(totalDx, totalDy) > 8) {
        this.touchMoved = true;
      }

      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.touchMoved && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        this.handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
      }
      this.touchMoved = false;
    }, { passive: false });
  }

  screenToTile(screenX, screenY) {
    const mapPixelWidth = this.grid.width * TILE_SIZE;
    const mapPixelHeight = this.grid.height * TILE_SIZE;
    const startX = -mapPixelWidth / 2;
    const startY = -mapPixelHeight / 2;

    const worldX = (screenX - this.canvas.width / 2 - this.renderer.cameraX) / this.renderer.zoom - startX;
    const worldY = (screenY - this.canvas.height / 2 - this.renderer.cameraY) / this.renderer.zoom - startY;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    return this.grid.getTile(tileX, tileY);
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const tile = this.screenToTile(mouseX, mouseY);

    if (!tile) return;

    if (this.activeTool === 'inspect') {
      this.renderer.selectedTile = tile;
      document.getElementById('inspector-panel').classList.add('visible');
      this.updateInspector(tile, { force: true });
      return;
    }
    if (this.activeTool === 'pan') {
      this.renderer.selectedTile = tile;
      return;
    }

    let success = false;
    let cost = 0;

    if (this.activeTool === 'road') {
      cost = COSTS.ROAD;
      if (this.treasury >= cost && this.grid.placeRoad(tile.x, tile.y)) {
        success = true;
      }
    } else if (this.activeTool === 'bridge') {
      cost = COSTS.BRIDGE;
      if (this.treasury >= cost && this.grid.placeBridge(tile.x, tile.y)) {
        success = true;
      }
    } else if (this.activeTool === 'tunnel') {
      cost = COSTS.TUNNEL;
      if (this.treasury >= cost && this.grid.placeTunnel(tile.x, tile.y)) {
        success = true;
      }
    } else if (this.activeTool === 'zone_r') {
      cost = COSTS.ZONE;
      if (this.treasury >= cost && this.grid.placeZone(tile.x, tile.y, ZONE.RESIDENTIAL)) {
        success = true;
      }
    } else if (this.activeTool === 'zone_c') {
      cost = COSTS.ZONE;
      if (this.treasury >= cost && this.grid.placeZone(tile.x, tile.y, ZONE.COMMERCIAL)) {
        success = true;
      }
    } else if (this.activeTool === 'zone_i') {
      cost = COSTS.INDUSTRIAL_ZONE;
      if (this.treasury >= cost && this.grid.placeZone(tile.x, tile.y, ZONE.INDUSTRIAL)) {
        success = true;
      }
    } else if (this.activeTool === 'zone_a') {
      cost = COSTS.AGRICULTURAL_ZONE;
      if (this.treasury >= cost && this.grid.placeZone(tile.x, tile.y, ZONE.AGRICULTURAL)) {
        success = true;
      }
    } else if (this.activeTool === 'survey') {
      if (this.grid.startSurvey(tile.x, tile.y)) {
        success = true;
      }
    } else if (this.activeTool.startsWith('producer_')) {
      const typeKey = this.activeTool.replace('producer_', '').toUpperCase();
      const pType = PRODUCER_TYPE[typeKey] || PRODUCER_TYPE[`${typeKey}_PLANT`] || PRODUCER_TYPE[`${typeKey}_TOWER` ];
      const config = PRODUCER_CONFIG[pType];
      const buildCost = config?.cost;
      if (config && this.treasury >= buildCost) {
        if (this.grid.placeProducer(tile.x, tile.y, pType, config.capacity)) {
          cost = buildCost;
          success = true;
        }
      }
    } else if (this.activeTool === 'bulldoze') {
      cost = COSTS.BULLDOZE;
      if (this.treasury >= cost && this.grid.bulldoze(tile.x, tile.y)) {
        success = true;
      }
    }

    if (success) {
      this.treasury -= cost;
      this.simulation.tick(false);
      this.updateHUD({ force: true });
      if (this.renderer.selectedTile) {
        this.updateInspector(this.renderer.selectedTile, { force: true });
      }
      // Only single-placement buildings (producers) auto-revert to Pan; repeatable
      // tools like roads/zones/bulldoze stay active so you can keep placing.
      if (this.isMobileLayout() && this.autoSwitchToPan && this.activeTool.startsWith('producer_')) {
        this.setActiveTool('pan');
      }
    }

  }

  isMobileLayout() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 820px) and (hover: none) and (pointer: coarse)').matches;
  }

  updateBuildInfoPanel(tool) {
    const panel = document.getElementById('build-info-panel');
    const title = document.getElementById('build-info-title');
    const body = document.getElementById('build-info-body');
    const row = (label, val) => `<div class="info-row"><span class="label">${label}:</span><span class="val">${val}</span></div>`;

    if (tool.startsWith('producer_')) {
      const typeKey = tool.replace('producer_', '').toUpperCase();
      const pType = PRODUCER_TYPE[typeKey] || PRODUCER_TYPE[`${typeKey}_PLANT`] || PRODUCER_TYPE[`${typeKey}_TOWER`];
      const config = PRODUCER_CONFIG[pType];
      if (!config) {
        panel.classList.remove('visible');
        return;
      }

      title.textContent = config.name;
      const rows = [row('Cost', `$${config.cost.toLocaleString()}`)];
      if (config.requiresWaterAdjacent) rows.push(row('Requires', 'Adjacent to water'));

      if (config.utility === 'power') {
        if (pType === PRODUCER_TYPE.WINDMILL) {
          rows.push(row('Power Output', `${WIND_CONFIG.MIN_CAPACITY}-${WIND_CONFIG.BASE_CAPACITY + WIND_CONFIG.FLUCTUATION} (fluctuates each tick)`));
          rows.push(row('Requires', 'Adjacent (incl. diagonals) to Battery Storage to transmit power'));
        } else if (pType === PRODUCER_TYPE.SOLAR_PANEL) {
          rows.push(row('Power Output', `0-${SOLAR_CONFIG.PEAK_CAPACITY} (day only, peaks at noon)`));
          rows.push(row('Requires', 'Adjacent (incl. diagonals) to Battery Storage to transmit power'));
        } else if (pType === PRODUCER_TYPE.BATTERY) {
          rows.push(row('Storage Capacity', `${BATTERY_CONFIG.MAX_STORAGE}`));
          rows.push(row('Discharge Rate', `${BATTERY_CONFIG.DISCHARGE_RATE} / tick`));
        } else {
          rows.push(row('Power Output', `${config.capacity}`));
        }
        if (pType === PRODUCER_TYPE.COAL_PLANT) {
          rows.push(row('Pollution', `Emits ${COAL_CONFIG.EMISSION} within ${COAL_CONFIG.RADIUS} tiles`));
        } else if (pType !== PRODUCER_TYPE.BATTERY) {
          rows.push(row('Pollution', 'None'));
        }
      } else if (config.utility === 'water' || config.utility === 'sewage') {
        rows.push(row('Capacity', `${config.capacity}`));
      } else if (config.jobs) {
        rows.push(row('Jobs (Light/Medium/High)', `${config.jobs.light} / ${config.jobs.medium} / ${config.jobs.high}`));
        if (config.radius) rows.push(row('Coverage Radius (L/M/H)', `${config.radius.light} / ${config.radius.medium} / ${config.radius.high}`));
        if (pType === PRODUCER_TYPE.HOSPITAL || pType === PRODUCER_TYPE.CLINIC) {
          const cap = (staff) => staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB;
          if (pType === PRODUCER_TYPE.CLINIC) {
            rows.push(row('Max Population Served', 'Up to 5,000 residents'));
            rows.push(row('Patient Capacity', `${cap(config.jobs.light)} (fixed size)`));
          } else {
            rows.push(row('Patient Capacity (L/M/H)', `${cap(config.jobs.light)} / ${cap(config.jobs.medium)} / ${cap(config.jobs.high)}`));
          }
        } else if (pType === PRODUCER_TYPE.OIL_DERRICK) {
          rows.push(row('Output', 'Extracts up to 100 oil per tick'));
        } else if (pType === PRODUCER_TYPE.REFINERY) {
          rows.push(row('Processing', 'Converts up to 100 oil into 50 fuel per tick'));
        }
      } else if (config.surveyDuration) {
        rows.push(row('Survey Duration (Flat/Mountain)', `${config.surveyDuration.standard} / ${config.surveyDuration.mountain} ticks`));
      }

      body.innerHTML = rows.join('');
      panel.classList.add('visible');
    } else if (tool === 'zone_r' || tool === 'zone_c' || tool === 'zone_i' || tool === 'zone_a') {
      const zoneType = tool === 'zone_r' ? ZONE.RESIDENTIAL
        : tool === 'zone_c' ? ZONE.COMMERCIAL
        : tool === 'zone_a' ? ZONE.AGRICULTURAL
        : ZONE.INDUSTRIAL;
      const cost = tool === 'zone_i' || tool === 'zone_a' ? (tool === 'zone_a' ? COSTS.AGRICULTURAL_ZONE : COSTS.INDUSTRIAL_ZONE) : COSTS.ZONE;
      title.textContent = tool === 'zone_r' ? 'Residential Zone'
        : tool === 'zone_c' ? 'Commercial Zone'
        : tool === 'zone_a' ? 'Agricultural Zone'
        : 'Industrial Zone';

      const rows = [row('Cost', `$${cost.toLocaleString()}`)];
      if (zoneType === ZONE.RESIDENTIAL) {
        rows.push(row('Population (Light/Medium/High)', `${RESIDENTIAL_CAPACITY[DENSITY.LIGHT]} / ${RESIDENTIAL_CAPACITY[DENSITY.MEDIUM]} / ${RESIDENTIAL_CAPACITY[DENSITY.HIGH]}`));
      } else {
        const jobs = JOBS_PROVIDED[zoneType];
        rows.push(row('Jobs (Light/Medium/High)', `${jobs[DENSITY.LIGHT]} / ${jobs[DENSITY.MEDIUM]} / ${jobs[DENSITY.HIGH]}`));
      }
      if (zoneType === ZONE.INDUSTRIAL) {
        rows.push(row('Pollution (Light/Medium/High)', `${POLLUTION_CONFIG.INDUSTRIAL_EMISSION.light} / ${POLLUTION_CONFIG.INDUSTRIAL_EMISSION.medium} / ${POLLUTION_CONFIG.INDUSTRIAL_EMISSION.high}`));
        rows.push(row('Pollution Radius (L/M/H)', `${POLLUTION_CONFIG.INDUSTRIAL_RADIUS.light} / ${POLLUTION_CONFIG.INDUSTRIAL_RADIUS.medium} / ${POLLUTION_CONFIG.INDUSTRIAL_RADIUS.high}`));
      }
      if (zoneType === ZONE.AGRICULTURAL) {
        rows.push(row('Food yield (L/M/H)', '4 / 20 / 80 at full jobs'));
        rows.push(row('Fuel use', '4 per tick at full occupancy'));
      }
      if (zoneType === ZONE.COMMERCIAL) {
        rows.push(row('Consumer goods', 'City goods supply doubles commercial tax'));
        rows.push(row('Fuel use', '2 per tick at full occupancy'));
      }
      if (zoneType === ZONE.RESIDENTIAL) {
        rows.push(row('Fuel use', '1 per tick at full occupancy'));
      }
      if (zoneType === ZONE.INDUSTRIAL) {
        rows.push(row('Fuel use', '4 per tick at full occupancy'));
      }

      body.innerHTML = rows.join('');
      panel.classList.add('visible');
    } else {
      panel.classList.remove('visible');
    }
  }

  updateInspector(tile, { force = false } = {}) {
    if (!tile) return false;
    const started = this.enableUiTiming ? nowMs() : 0;
    const signature = buildInspectorSignature(this.grid, tile);
    const differentTile = this._inspectorTile !== tile;
    const changed = signature !== this._inspectorSignature;
    const cadenceMs = getHudCadenceMs(this.isMobileLayout());
    const at = nowMs();
    if (!shouldRefreshUi({
      force: force || differentTile,
      fieldCount: changed ? 1 : 0,
      now: at,
      lastAppliedAt: this._inspectorAppliedAt,
      cadenceMs,
    })) {
      this._pendingInspectorTile = changed ? tile : null;
      recordUiTiming(this.inspectorTiming, this.enableUiTiming ? nowMs() - started : 0, false);
      return false;
    }

    document.getElementById('inspect-coord').textContent = `(${tile.x}, ${tile.y})`;
    document.getElementById('inspect-terrain').textContent = tile.terrain;

    const effectRow = document.getElementById('terrain-effect-row');
    const effectVal = document.getElementById('inspect-terrain-effect');
    if (tile.terrain === TERRAIN.FOREST) {
      effectRow.style.display = '';
      effectVal.textContent = `-${FOREST_POLLUTION_ABSORPTION} Pollution Absorption / +1 Nearby Residential Growth`;
    } else {
      effectRow.style.display = 'none';
    }
    document.getElementById('inspect-road').textContent = tile.hasBridge ? 'Bridge' : tile.hasRoad ? 'Yes' : 'No';
    document.getElementById('inspect-zone').textContent = tile.zone;
    document.getElementById('inspect-density').textContent = tile.zone !== ZONE.NONE ? tile.density : 'N/A';

    const popJobsEl = document.getElementById('inspect-pop-jobs');
    const recipeRow = document.getElementById('industrial-recipe-row');
    const recipeSelect = document.getElementById('industrial-recipe-select');
    const storageRow = document.getElementById('storage-type-row');
    const storageSelect = document.getElementById('storage-type-select');
    const demographicsRow = document.getElementById('demographics-row');
    const demographicsVal = document.getElementById('inspect-demographics');
    if (popJobsEl) {
      if (tile.zone === ZONE.RESIDENTIAL) {
        const cur = (tile.population || 0).toLocaleString();
        const max = (tile.maxPopulation || RESIDENTIAL_CAPACITY[tile.density] || 0).toLocaleString();
        popJobsEl.textContent = `${cur} / ${max} residents`;
        const demo = splitDemographics(tile.population || 0);
        if (demographicsRow && demographicsVal) {
          demographicsRow.style.display = '';
          demographicsVal.textContent = `${demo.workforce} / ${demo.schoolAge} / ${demo.retirees}`;
        }
      } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL || tile.zone === ZONE.AGRICULTURAL) {
        if (demographicsRow) demographicsRow.style.display = 'none';
        const filled = (tile.filledJobs || 0).toLocaleString();
        const total = (tile.totalJobs || JOBS_PROVIDED[tile.zone]?.[tile.density] || 0).toLocaleString();
        popJobsEl.textContent = `${filled} / ${total} jobs filled`;
      } else if (tile.producer && PRODUCER_CONFIG[tile.producer.type]?.jobs) {
        if (demographicsRow) demographicsRow.style.display = 'none';
        const filled = (tile.producer.filledJobs || 0).toLocaleString();
        const total = (tile.producer.totalJobs || 0).toLocaleString();
        popJobsEl.textContent = `${filled} / ${total} jobs filled`;
      } else {
        if (demographicsRow) demographicsRow.style.display = 'none';
        popJobsEl.textContent = 'N/A';
      }
    }
    if (recipeRow && recipeSelect) {
      if (tile.zone === ZONE.INDUSTRIAL) {
        recipeRow.style.display = '';
        recipeSelect.innerHTML = Object.keys(FACTORY_RECIPES)
          .map((key) => `<option value="${key}">${key.replace('_', ' ')}</option>`)
          .join('');
        recipeSelect.value = tile.recipe || 'CONSUMER_GOODS';
        recipeSelect.onchange = () => { tile.recipe = recipeSelect.value; };
      } else {
        recipeRow.style.display = 'none';
      }
    }
    if (storageRow && storageSelect) {
      const storageTypes = tile.producer && PRODUCER_CONFIG[tile.producer.type]?.storageTypes;
      if (storageTypes) {
        storageRow.style.display = '';
        storageSelect.innerHTML = storageTypes.map((type) => `<option value="${type}">${type.toUpperCase()}</option>`).join('');
        storageSelect.value = tile.producer.storageType || storageTypes[0];
        storageSelect.onchange = () => { tile.producer.storageType = storageSelect.value; };
      } else {
        storageRow.style.display = 'none';
      }
    }

    document.getElementById('inspect-growth').textContent = tile.zone !== ZONE.NONE ? Number(tile.growthScore || 0).toFixed(2) : 'N/A';
    document.getElementById('inspect-pollution').textContent = tile.pollution;

    const crime = tile.crime || 0;
    const crimeLevel = crime <= 0 ? 'Safe' : crime < CRIME_CONFIG.CRIME_PENALTY_THRESHOLD ? 'Moderate' : 'High Crime';
    document.getElementById('inspect-crime').textContent = crimeLevel;
    const crimeTaxPenalty = Math.min(CRIME_CONFIG.MAX_TAX_LOSS_RATIO, crime * CRIME_CONFIG.TAX_LOSS_PER_CRIME_POINT);
    document.getElementById('inspect-crime-tax-loss').textContent = `-${Math.round(crimeTaxPenalty * 100)}%`;
    const repairPct = Math.round((tile.fireRepair ?? 1) * 100);
    document.getElementById('inspect-fire').textContent = tile.onFire
      ? `Yes (Damage: ${Math.min(100, Math.round(tile.fireDamage || 0))}%)`
      : repairPct < 100
        ? `Repairing (${repairPct}% use)`
        : 'No';
    const oreEl = document.getElementById('inspect-ore');
    if (oreEl) {
      if (tile.oreDiscovered) {
        oreEl.textContent = tile.discoveredOre ? tile.discoveredOre.replace('_', ' ') : 'No deposit';
      } else if (tile.surveyingBy) {
        oreEl.textContent = `Surveying ${tile.surveyProgress} / ${tile.surveyRequired} ticks`;
      } else {
        oreEl.textContent = 'Not surveyed';
      }
    }

    const connectionStatus = tile.producer
      ? getProducerConnectionStatus(this.grid, tile.producer)
      : null;
    const isBatteryDependent = connectionStatus?.isBatteryDependent;
    const isConnected = connectionStatus ? connectionStatus.isConnected : this.grid.isRoadAdjacent(tile.x, tile.y);
    document.getElementById('inspect-connected').textContent = isConnected ? 'Yes' : 'No';

    document.getElementById('inspect-power').textContent = getTileUtilityStatus(this.grid, tile, 'power');
    document.getElementById('inspect-water').textContent = getTileUtilityStatus(this.grid, tile, 'water');
    document.getElementById('inspect-sewage').textContent = getTileUtilityStatus(this.grid, tile, 'sewage');

    const prodPanel = document.getElementById('producer-details');
    if (tile.producer) {
      prodPanel.style.display = 'block';
      const config = PRODUCER_CONFIG[tile.producer.type];
      const prodHasRoad = this.grid.isRoadAdjacent(tile.producer.x, tile.producer.y);
      const isBatteryDependent = tile.producer.type === PRODUCER_TYPE.WINDMILL || tile.producer.type === PRODUCER_TYPE.SOLAR_PANEL;
      const roadStatusStr = isBatteryDependent
        ? connectionStatus.message ? ` (${connectionStatus.message})` : ''
        : prodHasRoad ? '' : ' ⚠️ (Needs Road!)';
      const utilityStatusStr = !isBatteryDependent && PRODUCER_CONFIG[tile.producer.type]?.utilityUsage && !tile.producer.operational
        ? ' ⚠️ (Needs Utilities!)'
        : '';
      const contaminatedStr = tile.producer.contaminated ? ' ☣️ Contaminated!' : '';
      document.getElementById('inspect-producer-type').textContent = (config ? config.name : tile.producer.type) + roadStatusStr + utilityStatusStr + contaminatedStr;

      const capLabel = document.getElementById('inspect-producer-cap-label');
      const capVal = document.getElementById('inspect-producer-cap');
      if (isBatteryDependent && !tile.producer.hasBatteryConnection) {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = '⚠️ Offline (Must be adjacent to Battery Storage)';
      } else if (tile.producer.type === PRODUCER_TYPE.BATTERY) {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = formatProducerCapacity(tile.producer, this.grid);
      } else if (tile.producer.type === PRODUCER_TYPE.HOSPITAL || tile.producer.type === PRODUCER_TYPE.CLINIC) {
        const staff = tile.producer.filledJobs || 0;
        const patientCap = staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB;
        capLabel.textContent = 'Patient Capacity:';
        capVal.textContent = `${patientCap} (${staff} staffed)`;
      } else if (config?.utility === 'power' || config?.utility === 'water' || config?.utility === 'sewage') {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = formatProducerCapacity(tile.producer, this.grid);
      } else if (config?.jobs) {
        capLabel.textContent = 'Staff:';
        capVal.textContent = `${(tile.producer.filledJobs || 0).toLocaleString()} / ${(tile.producer.totalJobs || 0).toLocaleString()}`;
      } else {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = 'N/A';
      }
    } else {
      prodPanel.style.display = 'none';
    }

    this._inspectorTile = tile;
    this._inspectorSignature = signature;
    this._inspectorAppliedAt = at;
    this._pendingInspectorTile = null;
    recordUiTiming(this.inspectorTiming, this.enableUiTiming ? nowMs() - started : 0, true);
    return true;
  }

  logUiTimingIfNeeded() {
    if (!this.enableUiTiming) return;
    const frames = this.renderer.renderFrameCount;
    if (frames === 0 || frames % 120 !== 0) return;
    console.log('[debugTiming]', {
      sim: this.simulation.getStageTimings().averages,
      render: this.renderer.getRenderTimings(),
      hud: uiTimingAverages(this.hudTiming),
      inspector: uiTimingAverages(this.inspectorTiming),
    });
  }

  startRenderLoop() {
    const loop = () => {
      this.renderer.render(this.simulation);
      if (this._pendingHud) this.updateHUD();
      if (this._pendingInspectorTile) this.updateInspector(this._pendingInspectorTile);
      this.logUiTimingIfNeeded();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new GameApp();
});
