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
import { deserializeGame, deserializeGameFromJson, serializeGameToJson } from './engine/SaveGame.js';
import { AudioManager } from './engine/AudioManager.js';
import { LoanManager, loanTerms, shouldEndGame } from './engine/LoanManager.js';
import { advanceWorldEconomy } from './engine/WorldFinance.js';
import { TutorialManager } from './engine/TutorialManager.js';
import { APP_VERSION, ZONE, TERRAIN, PRODUCER_TYPE, PRODUCER_CONFIG, SERVICE_CONFIG, FACTORY_RECIPES, COSTS, TILE_SIZE, STARTING_TREASURY, RESIDENTIAL_CAPACITY, JOBS_PROVIDED, FOREST_POLLUTION_ABSORPTION, FOREST_DESIRABILITY_RADIUS, CRIME_CONFIG, MEDICAL_CONFIG, POWER_PRODUCER_TYPES, POLLUTION_CONFIG, COAL_CONFIG, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, RESOURCE_CONFIG, UTILITY_OPERATING_COST, SURVEY_COST_PER_TICK, TICKS_PER_HOUR, DENSITY, RENDERER_CONFIG, TERRAIN_GENERATION_CONFIG, MAP_SEED_STORAGE_KEY, EDUCATION_CONFIG, LOAN_CONFIG, splitDemographics, getZoneUpgradeCost, isZoneAtCapacity } from './config.js';

const nowMs = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    const urlSeed = parseInt(new URLSearchParams(window.location.search).get('seed'), 10);
    const homeSeed = parseInt(localStorage.getItem('simconquer_home_seed'), 10);
    this.grid = new Grid(undefined, undefined, urlSeed > 0 ? urlSeed : homeSeed > 0 ? homeSeed : null);
    localStorage.setItem('simconquer_home_seed', this.grid.seed);
    this.worldSeed = parseInt(localStorage.getItem('simconquer_world_seed'), 10) || this.grid.seed;
    localStorage.setItem('simconquer_world_seed', this.worldSeed);
    this.homeSeed = this.grid.seed;
    this.currentCellId = null;
    this.selectedCellId = null;
    this.cityStates = new Map();
    this.overworldSeedOverrides = new Map();
    this.planet = null;
    this.overworldView = null;
    this.terrainPreviewCache = new Map();
    this.simulation = new Simulation(this.grid);
    this.renderer = new Renderer(this.canvas, this.grid);
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
    const overworldVersionEl = document.getElementById('overworld-version');
    if (overworldVersionEl) overworldVersionEl.textContent = `v${APP_VERSION}`;
    const stylesheet = document.querySelector('link[rel="stylesheet"]');
    if (stylesheet) {
      const href = new URL(stylesheet.href, window.location.href);
      href.searchParams.set('v', APP_VERSION);
      stylesheet.href = href.toString();
    }

    this.treasury = STARTING_TREASURY;
    this.loanManager = new LoanManager();
    this.gameOver = false;
    this.hasEverHadPopulation = false;
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
    this.tutorialManager = new TutorialManager(this, { showWelcome: false });
    this.syncWorldOptionsAvailability();

    this.setSpeed(0);
    this.startRenderLoop();
    this.openOverworld().then(() => this.tutorialManager.checkWelcomeModal());
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
    document.getElementById('btn-overworld')?.addEventListener('click', () => this.openOverworld());

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

    document.getElementById('loan-principal-select')?.addEventListener('change', () => this.updateFinancePanel());
    document.getElementById('btn-take-loan')?.addEventListener('click', () => this.takeSelectedLoan());

    document.getElementById('btn-pause').addEventListener('click', () => this.setSpeed(0));
    document.getElementById('btn-speed-1').addEventListener('click', () => this.setSpeed(1));
    document.getElementById('btn-speed-2').addEventListener('click', () => this.setSpeed(2));
    document.getElementById('btn-speed-5').addEventListener('click', () => this.setSpeed(5));
    document.getElementById('btn-restart-game')?.addEventListener('click', () => window.location.reload());

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

    const roadBudgetSlider = document.getElementById('road-maintenance-budget-slider');
    if (roadBudgetSlider) {
      roadBudgetSlider.addEventListener('input', (e) => {
        this.simulation.roadMaintenanceBudget = parseInt(e.target.value, 10);
        const value = document.getElementById('road-maintenance-budget-value');
        if (value) value.textContent = `${this.simulation.roadMaintenanceBudget}%`;
        this.simulation.computeStats({ preservePopulation: true });
        this.updateHUD({ force: true });
      });
    }

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
    document.getElementById('btn-upgrade-zone')?.addEventListener('click', () => this.upgradeSelectedZone());

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

  resetMapWithSeed(seed, cellId = this.selectedCellId) {
    const cell = this.planet?.getCell(cellId);
    if (!cell || cell.ocean) return;
    const validSeed = parseInt(seed, 10) || cell.seed;
    cell.seed = validSeed;
    this.terrainPreviewCache.delete(cellId);
    const isCurrentCity = cellId === this.currentCellId;
    if (isCurrentCity) {
      this.grid.randomizeGrid(validSeed);
      if (cellId === this.homeCellId) {
        this.homeSeed = validSeed;
        localStorage.setItem('simconquer_home_seed', validSeed);
      }
      localStorage.setItem(MAP_SEED_STORAGE_KEY, validSeed);
      const url = new URL(window.location.href);
      url.searchParams.set('seed', validSeed);
      window.history.replaceState({}, '', url.toString());
      this.simulation.tickCount = 0;
      this.simulation.computeStats();
      this.renderer.selectedTile = null;
      this.renderer.hoverTile = null;
      this.updateHUD({ force: true });
      this.renderer.render(this.simulation);
    } else {
      this.cityStates.delete(cellId);
      if (cellId === this.homeCellId) {
        this.homeSeed = validSeed;
        localStorage.setItem('simconquer_home_seed', validSeed);
      }
    }
    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = validSeed;
    this.overworldView?.select(cell);
  }

  syncWorldOptionsAvailability() {
    const cell = this.planet?.getCell(this.selectedCellId);
    const disabled = !cell || cell.ocean;
    const seedInput = document.getElementById('seed-input');
    if (seedInput) {
      seedInput.disabled = disabled;
      seedInput.value = disabled ? '' : cell.seed;
    }
    for (const id of ['seed-input', 'btn-reset-map', 'btn-regen-map']) {
      const control = document.getElementById(id);
      if (control) control.disabled = disabled;
    }
  }

  captureCity() {
    return {
      grid: this.grid,
      simulation: this.simulation,
      camera: { x: this.renderer.cameraX, y: this.renderer.cameraY, zoom: this.renderer.zoom },
      activeTool: this.activeTool,
      overlayMode: this.renderer.overlayMode,
    };
  }

  async openOverworld() {
    if (this.gameOver) return;
    if (this.overworldView?.isOpen) return;
    const button = document.getElementById('btn-overworld');
    button.disabled = true;
    this.setSpeed(0);
    try {
      if (!this.overworldView) {
        const [{ OverworldMap }, { OverworldView }] = await Promise.all([
          import('./engine/OverworldMap.js'), import('./engine/OverworldView.js'),
        ]);
        this.planet = new OverworldMap(this.worldSeed, this.homeSeed);
        for (const [id, seed] of this.overworldSeedOverrides) {
          const cell = this.planet.getCell(id);
          if (cell && !cell.ocean) cell.seed = seed;
        }
        this.homeCellId = this.planet.homeCellId;
        if (this.currentCellId) {
          if (this.planet.getCell(this.currentCellId)?.ocean) this.currentCellId = this.homeCellId;
          this.planet.getCell(this.currentCellId).seed = this.grid.seed;
          this.planet.getCell(this.currentCellId).biome = this.grid.biome || 'mixed';
          this.planet.refreshClimateProfiles();
        }
        this.overworldView = new OverworldView(document.getElementById('overworld-view'), this.planet, {
          onEnter: (id) => this.enterOverworldCell(id),
          onClose: () => this.renderer.render(this.simulation),
          onRegenerate: (seed) => this.regenerateOverworld(seed),
          onSelect: (cell) => {
            this.selectedCellId = cell?.id ?? null;
            this.syncWorldOptionsAvailability();
          },
          isVisited: (id) => this.cityStates.has(id),
          hasCity: (id) => (this.cityStates.get(id)?.grid.activeRoadTiles.size ?? 0) > 0,
          getTerrainStats: (id) => this.getOverworldTerrainStats(id),
        });
      }
      if (this.currentCellId) this.cityStates.set(this.currentCellId, this.captureCity());
      for (const [id, city] of this.cityStates) {
        const climate = this.planet.getCell(id)?.climate;
        if (climate) city.simulation.weatherManager.setClimate(climate);
      }
      this.syncWorldOptionsAvailability();
      this.overworldView.open(this.currentCellId);
    } catch (error) {
      console.error(error);
      document.getElementById('overworld-view').hidden = true;
      window.alert('Unable to open the world map. Check your connection to the map libraries.');
    } finally {
      button.disabled = false;
    }
  }

  getOverworldTerrainStats(id) {
    const cell = this.planet?.getCell(id);
    if (!cell || cell.ocean) return { water: 0, forest: 0, mountain: 0 };
    const cityGrid = id === this.currentCellId ? this.grid : this.cityStates.get(id)?.grid;
    if (cityGrid) return cityGrid.getTerrainPercentages();
    if (!this.terrainPreviewCache.has(id)) {
      const previewGrid = new Grid(undefined, undefined, cell.seed, cell.biome);
      this.terrainPreviewCache.set(id, previewGrid.getTerrainPercentages());
    }
    return this.terrainPreviewCache.get(id);
  }

  async regenerateOverworld(seed) {
    if (seed === this.worldSeed) return;
    if (!window.confirm('Generate a new planet? Your current city will move to its new home hex. Other visited cities will be removed.')) return;
    this.worldSeed = seed;
    this.homeSeed = this.grid.seed;
    localStorage.setItem('simconquer_world_seed', seed);
    localStorage.setItem('simconquer_home_seed', this.homeSeed);
    this.cityStates.clear();
    this.terrainPreviewCache.clear();
    this.overworldSeedOverrides.clear();
    if (this.currentCellId) {
      const { OverworldMap } = await import('./engine/OverworldMap.js');
      this.currentCellId = new OverworldMap(seed, this.homeSeed).homeCellId;
    }
    this.overworldView.dispose();
    this.overworldView = null;
    this.planet = null;
    await this.openOverworld();
  }

  enterOverworldCell(id) {
    if (this.gameOver) return;
    const cell = this.planet?.getCell(id);
    if (!cell || cell.ocean) return;
    if (id !== this.currentCellId) {
      if (this.currentCellId) this.cityStates.set(this.currentCellId, this.captureCity());
      const saved = this.cityStates.get(id);
      const city = saved || (() => {
        const grid = new Grid(this.grid.width, this.grid.height, cell.seed, cell.biome);
        const simulation = new Simulation(grid, cell.climate);
        simulation.isPaused = true;
        return { grid, simulation, camera: { x: 0, y: 0, zoom: 1 }, activeTool: 'pan', overlayMode: 'normal' };
      })();
      city.simulation.weatherManager.setClimate(cell.climate);
      this.currentCellId = id;
      this.cityStates.set(id, city);
      this.syncWorldOptionsAvailability();
      this.grid = city.grid;
      this.simulation = city.simulation;
      this.renderer.grid = city.grid;
      this.renderer.terrainChunks = [];
      this.renderer.terrainChunksVersion = -1;
      this.renderer.selectedTile = null;
      this.renderer.hoverTile = null;
      this.renderer.trafficManager.grid = city.grid;
      this.renderer.trafficManager.cars = [];
      this.renderer.trafficManager.lastCoverageVersion = -1;
      this.renderer.setCamera(city.camera.x, city.camera.y, city.camera.zoom);
      this.setActiveTool(city.activeTool);
      this.renderer.setOverlayMode(city.overlayMode);
      document.querySelectorAll('.overlay-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === city.overlayMode));
      document.getElementById('seed-input').value = city.grid.seed;
      this.setSpeed(0);
      this.simulation.tick(false);
      this.syncBudgetControls();
      this.updateHUD({ force: true });
    }
    document.getElementById('overworld-options').open = false;
    this.overworldView.currentId = id;
    this.overworldView.close();
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
      this.overworldView?.dispose();
      this.overworldView = null;
      this.planet = null;
      this.selectedCellId = null;
      this.worldSeed = imported.overworld?.seed ?? imported.grid.seed;
      this.overworldSeedOverrides = new Map(imported.overworld?.cellSeeds || []);
      this.currentCellId = imported.overworld?.cellId ?? null;
      this.homeSeed = imported.overworld?.homeSeed ?? imported.grid.seed;
      localStorage.setItem('simconquer_world_seed', this.worldSeed);
      localStorage.setItem('simconquer_home_seed', this.homeSeed);
      this.cityStates = new Map();
      this.terrainPreviewCache.clear();
      for (const visited of imported.overworld?.visited || []) {
        this.cityStates.set(visited.cellId, this.restoreImportedCity(deserializeGame(visited.city)));
      }
      const city = this.restoreImportedCity(imported);
      this.grid = city.grid;
      this.simulation = city.simulation;
      this.treasury = imported.treasury;
      this.loanManager = new LoanManager(imported.finance);
      this.gameOver = Boolean(imported.finance?.gameOver);
      this.hasEverHadPopulation = Boolean(imported.finance?.hasEverHadPopulation) ||
        this.simulation.stats.population > 0 ||
        Array.from(this.cityStates.values()).some((visitedCity) => visitedCity.simulation.stats.population > 0);
      localStorage.setItem(MAP_SEED_STORAGE_KEY, this.grid.seed);
      this.renderer.grid = this.grid;
      this.renderer.terrainChunks = [];
      this.renderer.terrainChunksVersion = -1;
      this.renderer.trafficManager.grid = this.grid;
      this.renderer.trafficManager.cars = [];
      this.renderer.trafficManager.lastCoverageVersion = -1;
      this.renderer.setCamera(imported.camera.x, imported.camera.y, imported.camera.zoom);
      this.autoSwitchToPan = imported.ui.autoSwitchToPan;
      this.setActiveTool(imported.ui.activeTool);
      this.renderer.setOverlayMode(imported.ui.overlayMode);
      document.querySelectorAll('.overlay-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === imported.ui.overlayMode));
      this.syncBudgetControls();
      this.updateHUD({ force: true });
      this.renderer.render(this.simulation);
      this.syncWorldOptionsAvailability();
      if (this.gameOver) this.showGameOver();
      if (imported.overworld) await this.openOverworld();
    } catch (error) {
      window.alert(`Unable to load save: ${error.message}`);
    }
  }

  restoreImportedCity(imported) {
    const simulation = new Simulation(imported.grid);
    simulation.tickCount = imported.simulation.tickCount;
    simulation.speed = 0;
    simulation.isPaused = true;
    simulation.taxRate = imported.simulation.taxRate;
    simulation.pensionBudget = imported.simulation.pensionBudget;
    simulation.roadMaintenanceBudget = imported.simulation.roadMaintenanceBudget ?? 100;
    simulation.resourceManager.stockpile = imported.simulation.stockpile;
    simulation.resourceManager.capacity = imported.simulation.capacity;
    if (imported.simulation.weather) Object.assign(simulation.weatherManager, imported.simulation.weather);
    simulation.stats = imported.simulation.stats;
    simulation.tick(false);
    return {
      grid: imported.grid,
      simulation,
      camera: imported.camera,
      activeTool: imported.ui.activeTool,
      overlayMode: imported.ui.overlayMode,
    };
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

    const roadBudgetSlider = document.getElementById('road-maintenance-budget-slider');
    const roadBudgetValue = document.getElementById('road-maintenance-budget-value');
    if (roadBudgetSlider) roadBudgetSlider.value = this.simulation.roadMaintenanceBudget;
    if (roadBudgetValue) roadBudgetValue.textContent = `${this.simulation.roadMaintenanceBudget}%`;

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
    if (this.gameOver && speed !== 0) return false;
    document.querySelectorAll('.speed-controls .btn-icon').forEach((b) => b.classList.remove('active'));
    if (speed === 0) {
      document.getElementById('btn-pause').classList.add('active');
      this.simulation.isPaused = true;
      this.simulation.speed = 0;
      if (this.simInterval) clearInterval(this.simInterval);
      this.simInterval = null;
    } else {
      const id = speed === 1 ? 'btn-speed-1' : speed === 2 ? 'btn-speed-2' : 'btn-speed-5';
      document.getElementById(id).classList.add('active');
      this.simulation.isPaused = false;
      this.simulation.speed = speed;
      if (this.simInterval) clearInterval(this.simInterval);
      this.simInterval = setInterval(() => this.simTick(), 4000 / speed);
    }
    return true;
  }

  simTick() {
    if (this.simulation.isPaused) return;
    if (this.getCombinedPopulation() > 0) this.hasEverHadPopulation = true;
    const economy = advanceWorldEconomy(this.getWorldSimulations(), this.treasury, this.loanManager);
    this.treasury = economy.treasury;
    if (this.getWorldSimulations().some((simulation) => simulation.stats.population > 0)) this.hasEverHadPopulation = true;
    this.checkDebtGameOver();
    this.audioManager?.updatePopulation(this.simulation.stats.population);
    this.updateHUD();
    if (this.renderer.selectedTile) {
      this.updateInspector(this.renderer.selectedTile);
    }
  }

  updateHUD({ force = false } = {}) {
    this.updateFinancePanel();
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

  getAverageCityHappiness() {
    const happiness = [this.simulation.stats.happiness ?? 50];
    for (const [cellId, city] of this.cityStates) {
      if (cellId === this.currentCellId) continue;
      happiness.push(city.simulation.stats.happiness ?? 50);
    }
    return happiness.reduce((sum, value) => sum + value, 0) / happiness.length;
  }

  getWorldSimulations() {
    const simulations = [];
    for (const [cellId, city] of this.cityStates) {
      if (cellId !== this.currentCellId) simulations.push(city.simulation);
    }
    simulations.push(this.simulation);
    return simulations;
  }

  getCombinedPopulation() {
    let population = this.simulation.stats.population || 0;
    for (const [cellId, city] of this.cityStates) {
      if (cellId === this.currentCellId) continue;
      population += city.simulation.stats.population || 0;
    }
    return population;
  }

  takeSelectedLoan() {
    if (this.gameOver) return false;
    const principal = Number(document.getElementById('loan-principal-select')?.value);
    const loan = this.loanManager.takeLoan(principal, this.getAverageCityHappiness());
    if (!loan) return false;
    this.treasury += principal;
    this.updateHUD({ force: true });
    return true;
  }

  updateFinancePanel() {
    const treasuryText = `$${this.treasury.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    const financeTreasury = document.getElementById('finance-treasury');
    const overworldTreasury = document.getElementById('overworld-treasury');
    if (financeTreasury) financeTreasury.textContent = treasuryText;
    if (overworldTreasury) overworldTreasury.textContent = treasuryText;

    const principalSelect = document.getElementById('loan-principal-select');
    const rate = document.getElementById('loan-interest-rate');
    const payment = document.getElementById('loan-estimated-payment');
    const average = document.getElementById('loan-average-happiness');
    const balance = document.getElementById('loan-outstanding-balance');
    const due = document.getElementById('loan-next-payment');
    const button = document.getElementById('btn-take-loan');
    const list = document.getElementById('loan-list');
    if (!principalSelect || !rate || !payment || !average || !balance || !due || !button || !list || !this.loanManager) return;

    const happiness = this.getAverageCityHappiness();
    const terms = loanTerms(Number(principalSelect.value), happiness);
    average.textContent = `${happiness.toFixed(1)} / 100`;
    rate.textContent = `${(terms.interestRate * 100).toFixed(1)}%`;
    payment.textContent = `$${terms.scheduledPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    balance.textContent = `$${this.loanManager.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    due.textContent = `$${this.loanManager.scheduledPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    button.disabled = this.gameOver;
    list.replaceChildren();
    for (const loan of this.loanManager.loans) {
      const row = document.createElement('div');
      row.className = 'storage-item';
      const title = document.createElement('span');
      title.textContent = `$${loan.principal.toLocaleString()} · ${(loan.interestRate * 100).toFixed(1)}%`;
      const value = document.createElement('strong');
      value.textContent = `$${loan.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${loan.ticksRemaining.toLocaleString()} ticks`;
      row.append(title, value);
      list.appendChild(row);
    }
  }

  checkDebtGameOver() {
    if (this.gameOver || !shouldEndGame(this.loanManager.outstandingBalance, this.getCombinedPopulation(), this.hasEverHadPopulation)) return false;
    this.gameOver = true;
    this.setSpeed(0);
    this.showGameOver();
    return true;
  }

  showGameOver() {
    this.setSpeed(0);
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.hidden = false;
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
      if (this.isRightMouseDown || (this.isMouseDown && this.activeTool === 'pan')) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.renderer.setCamera(this.renderer.cameraX + dx, this.renderer.cameraY + dy);
        if (Math.hypot(e.clientX - this.mouseDownStartX, e.clientY - this.mouseDownStartY) > 5) {
          this.mouseHasDragged = true;
        }
      } else {
        const point = this.canvasPoint(e.clientX, e.clientY);
        const tile = this.screenToTile(point.x, point.y);
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

  canvasPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * this.canvas.width / rect.width,
      y: (clientY - rect.top) * this.canvas.height / rect.height,
    };
  }

  zoomAt(clientX, clientY, targetZoom) {
    const { x: screenX, y: screenY } = this.canvasPoint(clientX, clientY);
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
    const point = this.canvasPoint(e.clientX, e.clientY);
    const tile = this.screenToTile(point.x, point.y);

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
      const inspector = document.getElementById('inspector-panel');
      if (!tile.destroyed && isZoneAtCapacity(tile)) {
        inspector.classList.add('visible');
        this.updateInspector(tile, { force: true });
      } else {
        inspector.classList.remove('visible');
      }
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

  upgradeSelectedZone() {
    const tile = this.renderer.selectedTile;
    if (!this.grid.canUpgradeZone(tile)) return false;
    const cost = getZoneUpgradeCost(tile.zone, tile.density);
    if (cost <= 0 || this.treasury < cost || !this.grid.upgradeZone(tile)) return false;
    this.treasury -= cost;
    this.simulation.tick(false);
    this.updateHUD({ force: true });
    this.updateInspector(tile, { force: true });
    return true;
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
    const signature = buildInspectorSignature(this.grid, tile, this.simulation.resourceManager, this.treasury);
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

    const capacityRow = document.getElementById('zone-capacity-row');
    const capacityStatus = document.getElementById('zone-capacity-status');
    const upgradeButton = document.getElementById('btn-upgrade-zone');
    const atCapacity = !tile.destroyed && isZoneAtCapacity(tile);
    const upgradeCost = getZoneUpgradeCost(tile.zone, tile.density);
    const canUpgrade = this.grid.canUpgradeZone(tile);
    if (capacityRow && capacityStatus && upgradeButton) {
      capacityRow.hidden = !atCapacity;
      upgradeButton.hidden = !canUpgrade;
      upgradeButton.disabled = !canUpgrade || this.treasury < upgradeCost;
      upgradeButton.textContent = `Upgrade ($${upgradeCost.toLocaleString()})`;
      capacityStatus.textContent = tile.density === DENSITY.HIGH
        ? 'Full · maximum tier'
        : this.treasury < upgradeCost
          ? 'Full · insufficient funds'
          : 'Full capacity';
    }

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
      if (!this.overworldView?.isOpen) this.renderer.render(this.simulation);
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
