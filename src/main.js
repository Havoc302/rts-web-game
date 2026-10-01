import { Grid, producerTypeForTool } from './engine/Grid.js';
import { Simulation } from './engine/Simulation.js';
import { Renderer } from './engine/Renderer.js';
import { UtilityManager } from './engine/UtilityManager.js';
import { ServiceManager } from './engine/ServiceManager.js';
import { getProducerConnectionStatus, getTileUtilityStatus, formatProducerCapacity, formatSiloStorage, formatDerrickOutput, getTileFoodFlow, isNuclearFuelStarved } from './engine/InspectorStatus.js';
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
import { AudioManager } from './engine/AudioManager.js';
import { TutorialManager } from './engine/TutorialManager.js';
import { APP_VERSION, ZONE, TERRAIN, PRODUCER_TYPE, PRODUCER_CONFIG, SERVICE_CONFIG, FACTORY_RECIPES, COSTS, TILE_SIZE, STARTING_TREASURY, RESIDENTIAL_CAPACITY, JOBS_PROVIDED, FOREST_POLLUTION_ABSORPTION, FOREST_DESIRABILITY_RADIUS, CRIME_CONFIG, MEDICAL_CONFIG, POWER_PRODUCER_TYPES, POLLUTION_CONFIG, COAL_CONFIG, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, RESOURCE_CONFIG, UTILITY_OPERATING_COST, SURVEY_COST_PER_TICK, TICKS_PER_HOUR, DENSITY, RENDERER_CONFIG, TERRAIN_GENERATION_CONFIG, MAP_SEED_STORAGE_KEY, EDUCATION_CONFIG, splitDemographics } from './config.js';

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
    this.dismissedAlerts = new Set();
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

    this.audioManager = new AudioManager();
    this.initAudioUI();
    this.tutorialManager = new TutorialManager(this);

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
    this.initHeaderTooltips();
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
        this.simulation.computeStats({ preservePopulation: true });
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
        this.simulation.computeStats({ preservePopulation: true });
        this.updateHUD({ force: true });
      });
    }

    const taxSlider = document.getElementById('tax-slider');
    if (taxSlider) {
      taxSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.simulation.taxRate = val;
        document.getElementById('tax-rate-val').textContent = val;
        this.simulation.computeStats({ preservePopulation: true });
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
        if (!window.confirm('Reset the map? All unsaved progress will be lost.')) return;
        const inputEl = document.getElementById('seed-input');
        let val = parseInt(inputEl?.value, 10);
        if (isNaN(val) || val <= 0) val = this.grid.seed;
        this.resetMapWithSeed(val);
      });
    }

    const regenBtn = document.getElementById('btn-regen-map');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        if (!window.confirm('Generate a new random map? All unsaved progress will be lost.')) return;
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

    document.getElementById('btn-close-inspector')?.addEventListener('click', () => {
      this.renderer.selectedTile = null;
      document.getElementById('inspector-panel').classList.remove('visible');
    });

    document.addEventListener('pointerdown', (e) => {
      const canvas = document.getElementById('game-canvas');
      const panel = document.getElementById('inspector-panel');
      if (e.target !== canvas && !panel?.contains(e.target)) {
        this.renderer.selectedTile = null;
        panel?.classList.remove('visible');
      }
    });
  }

  initAudioUI() {
    const audioBtn = document.getElementById('btn-toggle-audio');
    const promptModal = document.getElementById('audio-prompt-modal');
    const btnYes = document.getElementById('btn-audio-yes');
    const btnNo = document.getElementById('btn-audio-no');

    const updateButtonState = (active) => {
      if (!audioBtn) return;
      audioBtn.textContent = active ? '🔊' : '🔇';
      audioBtn.classList.toggle('active', active);
    };

    // Initial prompt modal handlers
    if (btnYes && btnNo && promptModal) {
      btnYes.addEventListener('click', () => {
        this.audioManager.enable();
        updateButtonState(true);
        promptModal.style.display = 'none';
      });

      btnNo.addEventListener('click', () => {
        updateButtonState(false);
        promptModal.style.display = 'none';
      });
    }

    // Toolbar Mute Button toggle
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isUnmuted = this.audioManager.toggleMute();
        updateButtonState(isUnmuted);
      });
    }
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
    const seed = this.grid?.seed ?? '0';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    link.download = `simconquer2000-save-${stamp}-seed-${seed}.json`;
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
      if (imported.simulation.weather && this.simulation.weatherManager) {
        Object.assign(this.simulation.weatherManager, imported.simulation.weather);
      }
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
      this.simulation.tick(false);
      this.simulation.isPaused = true;
      this.simulation.speed = 0;
      this.syncBudgetControls();
      this.updateHUD({ force: true });
      this.renderer.render(this.simulation);
    } catch (error) {
      window.alert(`Unable to load save: ${error.message}`);
    }
  }

  syncBudgetControls() {
    const taxSlider = document.getElementById('tax-slider');
    const taxVal = document.getElementById('tax-rate-val');
    if (taxSlider) taxSlider.value = this.simulation.taxRate;
    if (taxVal) taxVal.textContent = this.simulation.taxRate;

    const pensionSlider = document.getElementById('pension-budget-slider');
    const pensionVal = document.getElementById('pension-budget-value');
    if (pensionSlider) pensionSlider.value = this.simulation.pensionBudget;
    if (pensionVal) pensionVal.textContent = `${this.simulation.pensionBudget}%`;

    document.querySelectorAll('[data-service-budget]').forEach((slider) => {
      const type = slider.dataset.serviceBudget;
      const producer = this.grid.producers.find((p) => p.type === type || (type === 'hospital' && p.type === 'clinic'));
      const budget = producer?.budget ?? 100;
      slider.value = budget;
      const valueEl = document.getElementById(`${type}-budget-value`);
      if (valueEl) valueEl.textContent = `${budget}%`;
    });
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
    this.treasury += income - this.simulation.stats.serviceExpenses - this.simulation.stats.roadExpenses - (this.simulation.stats.utilityExpenses || 0) - (this.simulation.surveyExpenses || 0);
    this.audioManager?.updatePopulation(this.simulation.stats.population);
    this.updateHUD();
    if (this.renderer.selectedTile) {
      this.updateInspector(this.renderer.selectedTile);
    }
  }

  updateHUD({ force = false } = {}) {
    this.tutorialManager?.update(this.grid, this.simulation.stats);
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
    this.renderAlerts(snapshot['alerts-panel-data']);
    this._hudSnapshot = snapshot;
    this._hudAppliedAt = at;
    this._pendingHud = false;
    recordUiTiming(this.hudTiming, this.enableUiTiming ? nowMs() - started : 0, true);
    return true;
  }

  renderAlerts(serializedAlerts) {
    const panel = document.getElementById('alerts-panel');
    if (!panel) return;
    let alerts = [];
    try {
      alerts = JSON.parse(serializedAlerts || '[]');
    } catch {
      alerts = [];
    }
    const active = new Set(alerts.map((alert) => alert.id));
    for (const dismissed of this.dismissedAlerts) {
      if (!active.has(dismissed)) this.dismissedAlerts.delete(dismissed);
    }
    const visible = alerts.filter((alert) => !this.dismissedAlerts.has(alert.id));
    panel.replaceChildren();
    for (const alert of visible) {
      const row = document.createElement('div');
      row.className = 'alert-row';
      if (alert.x != null && alert.y != null) {
        row.classList.add('alert-actionable');
        row.title = 'Jump to location';
        row.addEventListener('click', () => this.jumpToAlert(alert));
      }
      const text = document.createElement('span');
      text.textContent = alert.message;
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'alert-dismiss';
      dismiss.textContent = '×';
      dismiss.title = 'Dismiss alert';
      dismiss.setAttribute('aria-label', `Dismiss ${alert.message}`);
      dismiss.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dismissedAlerts.add(alert.id);
        this.renderAlerts(JSON.stringify(alerts));
      });
      row.append(text, dismiss);
      panel.appendChild(row);
    }
    panel.style.display = visible.length > 0 ? 'block' : 'none';
  }

  jumpToAlert(alert) {
    const tile = this.grid.getTile(alert.x, alert.y);
    if (!tile) return;
    const worldX = -this.grid.width * TILE_SIZE / 2 + (tile.x + 0.5) * TILE_SIZE;
    const worldY = -this.grid.height * TILE_SIZE / 2 + (tile.y + 0.5) * TILE_SIZE;
    this.renderer.setCamera(-worldX * this.renderer.zoom, -worldY * this.renderer.zoom);
    this.renderer.selectedTile = tile;
    document.getElementById('inspector-panel')?.classList.add('visible');
    this.updateInspector(tile, { force: true });
    this.renderer.render(this.simulation);
  }

  // Tooltips live on <body> because the scrolling, backdrop-filtered header clips anything below it.
  initHeaderTooltips() {
    const tips = [];
    document.querySelectorAll('.stat-item.has-tooltip').forEach((item) => {
      const tip = item.querySelector('.stat-tooltip');
      if (!tip) return;
      tips.push({ item, tip });
      document.body.appendChild(tip);
      const show = () => {
        const rect = item.getBoundingClientRect();
        const half = tip.offsetWidth / 2;
        const x = Math.min(window.innerWidth - half - 8, Math.max(half + 8, rect.left + rect.width / 2));
        tip.style.left = `${x}px`;
        tip.style.top = `${rect.bottom + 8}px`;
        tip.classList.add('visible');
      };
      const hide = () => tip.classList.remove('visible');
      item.addEventListener('mouseenter', show);
      item.addEventListener('mouseleave', hide);
      item.addEventListener('focus', show);
      item.addEventListener('blur', hide);
      item.addEventListener('click', () => (tip.classList.contains('visible') ? hide() : show()));
    });
    const hideAll = () => tips.forEach(({ tip }) => tip.classList.remove('visible'));
    document.querySelector('.header-bar')?.addEventListener('scroll', hideAll, { passive: true });
    document.querySelector('.stats-counter')?.addEventListener('scroll', hideAll, { passive: true });
    window.addEventListener('resize', hideAll);
    document.addEventListener('pointerdown', (e) => {
      if (!tips.some(({ item, tip }) => item.contains(e.target) || tip.contains(e.target))) hideAll();
    });
  }

  setActiveTool(tool) {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');
    this.activeTool = tool;
    const overlayMode = tool === 'survey' ? 'survey' : 'normal';
    document.querySelectorAll('.overlay-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === overlayMode));
    this.renderer.setOverlayMode(overlayMode);
    this.renderer.placementTool = ['pan', 'inspect', 'bulldoze'].includes(this.activeTool) ? null : this.activeTool;
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
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoomAt(e.clientX, e.clientY, this.renderer.zoom * zoomFactor);
    });

    // Touch support: single-finger drag always pans the camera (never builds),
    // two-finger pinch zooms around the pinch midpoint, and a tap that didn't
    // move performs the active tool's action.
    const pinchState = (touches) => {
      const [a, b] = [touches[0], touches[1]];
      return {
        dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
    };

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        this.pinch = { ...pinchState(e.touches), zoom: this.renderer.zoom };
        this.touchMoved = true;
        return;
      }
      const touch = e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      this.touchMoved = false;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2 && this.pinch) {
        const now = pinchState(e.touches);
        this.renderer.setCamera(this.renderer.cameraX + now.midX - this.pinch.midX, this.renderer.cameraY + now.midY - this.pinch.midY);
        this.zoomAt(now.midX, now.midY, this.pinch.zoom * (now.dist / this.pinch.dist));
        this.pinch.midX = now.midX;
        this.pinch.midY = now.midY;
        return;
      }
      if (e.touches.length !== 1) return;
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
      if (e.touches.length < 2) this.pinch = null;
      if (e.touches.length === 1) {
        // Continue panning with the remaining finger without a jump.
        this.lastTouchX = e.touches[0].clientX;
        this.lastTouchY = e.touches[0].clientY;
        return;
      }
      if (!this.touchMoved && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        this.handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
      }
      this.touchMoved = false;
    }, { passive: false });
  }

  zoomAt(clientX, clientY, targetZoom) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const oldZoom = this.renderer.zoom;
    const worldX = (screenX - this.canvas.width / 2 - this.renderer.cameraX) / oldZoom;
    const worldY = (screenY - this.canvas.height / 2 - this.renderer.cameraY) / oldZoom;
    const newZoom = Math.min(RENDERER_CONFIG.ZOOM_MAX, Math.max(RENDERER_CONFIG.ZOOM_MIN, targetZoom));
    this.renderer.setCamera(
      screenX - this.canvas.width / 2 - worldX * newZoom,
      screenY - this.canvas.height / 2 - worldY * newZoom,
      newZoom,
    );
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
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const tile = this.screenToTile(mouseX * scaleX, mouseY * scaleY);

    if (!tile) {
      this.renderer.selectedTile = null;
      document.getElementById('inspector-panel').classList.remove('visible');
      return;
    }

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

    this.renderer.selectedTile = null;
    document.getElementById('inspector-panel').classList.remove('visible');

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
      const pType = producerTypeForTool(this.activeTool);
      const config = PRODUCER_CONFIG[pType];
      const buildCost = config?.cost;
      if (config && this.treasury >= buildCost && this.grid.canBuildProducer(tile.x, tile.y, pType)) {
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
      const pType = producerTypeForTool(tool);
      const config = PRODUCER_CONFIG[pType];
      if (!config) {
        panel.classList.remove('visible');
        return;
      }

      title.textContent = config.name;
      const rows = [row('Cost', `$${config.cost.toLocaleString()}`)];
      if (POWER_PRODUCER_TYPES.includes(pType) || pType === PRODUCER_TYPE.WATER_TOWER || pType === PRODUCER_TYPE.SEWAGE_PLANT) {
        rows.push(row('Operating / Hour', `$${(UTILITY_OPERATING_COST * TICKS_PER_HOUR).toLocaleString()}`));
      } else if (pType === PRODUCER_TYPE.SURVEY_STATION) {
        rows.push(row('Operating / Hour', `$0 idle / $${SURVEY_COST_PER_TICK * TICKS_PER_HOUR} surveying`));
      } else if (SERVICE_CONFIG[pType]) {
        const hourly = [DENSITY.LIGHT, DENSITY.MEDIUM, DENSITY.HIGH].map((density) => {
          const staff = config.jobs[density];
          return ServiceManager.getOperatingCost(pType, density, staff, staff) * TICKS_PER_HOUR;
        });
        rows.push(row('Operating / Hour (L/M/H)', hourly.some(Boolean)
          ? `${hourly.map((cost) => `$${cost.toLocaleString()}`).join(' / ')} (full staff & budget; actual varies)`
          : '$0 (no direct running cost)'));
      } else if (pType === PRODUCER_TYPE.REFINERY) {
        rows.push(row('Operating / Hour', '$0 direct (uses oil)'));
      }
      if (config.requiresWaterAdjacent) rows.push(row('Requires', 'Adjacent to water'));

      if (config.utility === 'power') {
        if (pType === PRODUCER_TYPE.WINDMILL) {
          rows.push(row('Power Output', `0-${WIND_CONFIG.MAX_CAPACITY || 65} MW (scales with wind intensity)`));
          rows.push(row('Requires', 'Adjacent (incl. diagonals) to Battery Storage to transmit power'));
        } else if (pType === PRODUCER_TYPE.SOLAR_PANEL) {
          rows.push(row('Power Output', `0-${SOLAR_CONFIG.PEAK_CAPACITY} (day only, peaks at noon, reduced by cloud cover)`));
          rows.push(row('Requires', 'Adjacent (incl. diagonals) to Battery Storage to transmit power'));
        } else if (pType === PRODUCER_TYPE.BATTERY) {
          rows.push(row('Storage Capacity', `${BATTERY_CONFIG.MAX_STORAGE}`));
          rows.push(row('Discharge Rate', `${BATTERY_CONFIG.DISCHARGE_RATE} / tick`));
        } else {
          rows.push(row('Power Output', `${config.capacity}`));
        }
        if (pType === PRODUCER_TYPE.NUCLEAR_PLANT) {
          rows.push(row('Requires', 'Uranium (stored in Ore Warehouse)'));
          rows.push(row('Uranium Use', `Up to ${RESOURCE_CONFIG.NUCLEAR_URANIUM_PER_TICK} / hour at full output; scales with power generated`));
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
        } else if (pType === PRODUCER_TYPE.SCHOOL || pType === PRODUCER_TYPE.UNIVERSITY) {
          const seats = (jobs) => jobs * EDUCATION_CONFIG.STUDENT_CAPACITY_PER_JOB;
          rows.push(row('Student Seats (L/M/H)', `${seats(config.jobs.light)} / ${seats(config.jobs.medium)} / ${seats(config.jobs.high)} at full staff`));
          rows.push(pType === PRODUCER_TYPE.SCHOOL
            ? row('Tax Bonus', `Up to +${EDUCATION_CONFIG.MAX_SCHOOL_TAX_BONUS * 100}% city tax when seats cover 15% of population`)
            : row('Tax Bonus', `Up to +${EDUCATION_CONFIG.MAX_UNI_TAX_BONUS * 100}% city tax when seats cover 5% of population (stacks with schools)`));
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
    const signature = buildInspectorSignature(this.grid, tile, this.simulation.resourceManager);
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
    const foodRow = document.getElementById('food-row');
    const foodFlow = getTileFoodFlow(tile);
    if (foodRow) {
      foodRow.style.display = foodFlow ? '' : 'none';
      document.getElementById('inspect-food').textContent = foodFlow || 'N/A';
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
      const utilityStatusStr = !isBatteryDependent && Object.values(tile.producer.utilityShortfall || {}).some(Boolean) && !tile.producer.operational
        ? ' ⚠️ (Needs Utilities!)'
        : '';
      const fuelStatusStr = isNuclearFuelStarved(tile.producer)
        ? ' ⚠️ (No Uranium!)'
        : '';
      const contaminatedStr = tile.producer.contaminated ? ' ☣️ Contaminated!' : '';
      document.getElementById('inspect-producer-type').textContent = (config ? config.name : tile.producer.type) + roadStatusStr + utilityStatusStr + fuelStatusStr + contaminatedStr;

      const capLabel = document.getElementById('inspect-producer-cap-label');
      const capVal = document.getElementById('inspect-producer-cap');
      if (isBatteryDependent && !tile.producer.hasBatteryConnection) {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = '⚠️ Offline (Must be adjacent to Battery Storage)';
      } else if (tile.producer.type === PRODUCER_TYPE.BATTERY) {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = formatProducerCapacity(tile.producer, this.grid);
      } else if (tile.producer.type === PRODUCER_TYPE.SILO) {
        capLabel.textContent = 'Stored / Capacity:';
        const resources = this.simulation.resourceManager;
        capVal.textContent = formatSiloStorage(tile.producer, resources.stockpile, resources.capacity);
      } else if (tile.producer.type === PRODUCER_TYPE.OIL_DERRICK) {
        capLabel.textContent = 'Output:';
        const resources = this.simulation.resourceManager;
        capVal.textContent = formatDerrickOutput(tile.producer, resources.stockpile, resources.capacity);
      } else if (tile.producer.type === PRODUCER_TYPE.HOSPITAL || tile.producer.type === PRODUCER_TYPE.CLINIC) {
        const staff = tile.producer.filledJobs || 0;
        const patientCap = staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB;
        capLabel.textContent = 'Patient Capacity:';
        capVal.textContent = `${patientCap} (${staff} staffed)`;
      } else if (config?.utility === 'power' || config?.utility === 'water' || config?.utility === 'sewage') {
        capLabel.textContent = 'Load / Capacity:';
        capVal.textContent = formatProducerCapacity(tile.producer, this.grid);
      } else if (tile.producer.type === PRODUCER_TYPE.SCHOOL || tile.producer.type === PRODUCER_TYPE.UNIVERSITY) {
        const staff = tile.producer.filledJobs || 0;
        capLabel.textContent = 'Staff / Seats:';
        capVal.textContent = `${staff} / ${tile.producer.totalJobs || 0} staff — ${(staff * EDUCATION_CONFIG.STUDENT_CAPACITY_PER_JOB).toLocaleString()} seats`;
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
