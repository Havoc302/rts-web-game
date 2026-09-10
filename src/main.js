import { Grid } from './engine/Grid.js';
import { Simulation } from './engine/Simulation.js';
import { Renderer } from './engine/Renderer.js';
import { APP_VERSION, ZONE, TERRAIN, PRODUCER_TYPE, PRODUCER_CONFIG, FACTORY_RECIPES, COSTS, TILE_SIZE, STARTING_TREASURY, RESIDENTIAL_CAPACITY, JOBS_PROVIDED, FOREST_POLLUTION_ABSORPTION, FOREST_DESIRABILITY_RADIUS, CRIME_CONFIG, MEDICAL_CONFIG, POWER_PRODUCER_TYPES, POLLUTION_CONFIG, COAL_CONFIG, WIND_CONFIG, SOLAR_CONFIG, BATTERY_CONFIG, DENSITY, RENDERER_CONFIG, TERRAIN_GENERATION_CONFIG } from './config.js';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.grid = new Grid();
    this.simulation = new Simulation(this.grid);
    this.renderer = new Renderer(this.canvas, this.grid);
    document.getElementById('app-version').textContent = `v${APP_VERSION}`;

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

    document.getElementById('btn-pause').addEventListener('click', () => this.setSpeed(0));
    document.getElementById('btn-speed-1').addEventListener('click', () => this.setSpeed(1));
    document.getElementById('btn-speed-2').addEventListener('click', () => this.setSpeed(2));
    document.getElementById('btn-speed-5').addEventListener('click', () => this.setSpeed(5));

    document.querySelectorAll('[data-service-budget]').forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const budget = parseInt(e.target.value, 10);
        const type = e.target.dataset.serviceBudget;
        this.grid.producers
          .filter((producer) => producer.type === type)
          .forEach((producer) => { producer.budget = budget; });
        const value = document.getElementById(`${type}-budget-value`);
        if (value) value.textContent = `${budget}%`;
        this.simulation.computeStats();
        this.updateHUD();
      });
    });

    const taxSlider = document.getElementById('tax-slider');
    if (taxSlider) {
      taxSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.simulation.taxRate = val;
        document.getElementById('tax-rate-val').textContent = val;
        this.simulation.computeStats();
        this.updateHUD();
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
  }

  resetMapWithSeed(seed) {
    const validSeed = parseInt(seed, 10) || this.grid.seed;
    this.grid.randomizeGrid(validSeed);

    const seedInput = document.getElementById('seed-input');
    if (seedInput) seedInput.value = this.grid.seed;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('metropolis_map_seed', this.grid.seed);
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
    this.updateHUD();
    this.renderer.render(this.simulation);
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
    const income = this.simulation.tick();
    this.treasury += income - this.simulation.stats.serviceExpenses - this.simulation.stats.roadExpenses;
    this.updateHUD();
    if (this.renderer.selectedTile) {
      this.updateInspector(this.renderer.selectedTile);
    }
  }

  updateHUD() {
    document.getElementById('stat-pop').textContent = this.simulation.stats.population.toLocaleString();
    document.getElementById('stat-cash').textContent = `$${this.treasury.toLocaleString()}`;
    document.getElementById('stat-income').textContent = `+$${this.simulation.stats.incomePerTick.toLocaleString()}`;
    const expensesEl = document.getElementById('stat-service-expenses');
    if (expensesEl) expensesEl.textContent = `-$${this.simulation.stats.serviceExpenses.toLocaleString()}`;
    const roadExpensesEl = document.getElementById('stat-road-expenses');
    if (roadExpensesEl) roadExpensesEl.textContent = `-$${this.simulation.stats.roadExpenses.toLocaleString()}`;
    document.getElementById('stat-tick').textContent = this.simulation.tickCount;

    const hour = this.simulation.getHourOfDay();
    const isDay = this.simulation.isDaytime();
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    const timeEl = document.getElementById('stat-time');
    if (timeEl) timeEl.textContent = `${isDay ? '☀️' : '🌙'} ${displayHour}:00 ${ampm}`;

    const stats = this.simulation.stats;

    const jobsAvailEl = document.getElementById('stat-jobs-avail');
    if (jobsAvailEl) jobsAvailEl.textContent = stats.jobsAvailable.toLocaleString();

    const empRateEl = document.getElementById('stat-emp-rate');
    if (empRateEl) empRateEl.textContent = `${Math.round(stats.employmentRate * 100)}%`;

    const stockpile = stats.resources?.stockpile || {};
    const resourcesEl = document.getElementById('stat-resources');
    if (resourcesEl) {
      resourcesEl.textContent = `Food ${Math.round(stockpile.food || 0)} | Coal ${Math.round(stockpile.coal || 0)} | Iron ${Math.round(stockpile.ironOre || 0)} | Bauxite ${Math.round(stockpile.bauxiteOre || 0)} | Goods ${Math.round(stockpile.consumerGoods || 0)}`;
    }

    this.updateMeter('meter-power-text', 'meter-power-fill', stats.powerDemand, stats.powerCapacity, true);
    this.updateMeter('meter-water-text', 'meter-water-fill', stats.waterDemand, stats.waterCapacity, true);
    this.updateMeter('meter-sewage-text', 'meter-sewage-fill', stats.sewageDemand, stats.sewageCapacity, true);
    this.updateMeter('meter-hospital-text', 'meter-hospital-fill', stats.patientDemand, stats.patientCapacity);

    const pollEl = document.getElementById('meter-pollution-text');
    if (pollEl) pollEl.textContent = `Avg ${stats.avgPollution} / Max ${stats.maxPollution}`;
    const pollFill = document.getElementById('meter-pollution-fill');
    if (pollFill) {
      const pct = stats.maxPollution > 0 ? Math.min(100, Math.round((stats.avgPollution / Math.max(stats.maxPollution, 1)) * 100)) : 0;
      pollFill.style.width = `${pct}%`;
    }
  }

  updateMeter(textId, fillId, demand, capacity, formatDecimals = false) {
    const displayDemand = formatDecimals ? demand.toFixed(2) : demand;
    const displayCapacity = formatDecimals ? capacity.toFixed(2) : capacity;
    document.getElementById(textId).textContent = `${displayDemand} / ${displayCapacity}`;
    const pct = capacity > 0 ? Math.min(100, Math.round((demand / capacity) * 100)) : 0;
    const fillEl = document.getElementById(fillId);
    fillEl.style.width = `${pct}%`;
    fillEl.style.backgroundColor = demand > capacity ? '#ef4444' : '';
  }

  setActiveTool(tool) {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');
    this.activeTool = tool;
    this.renderer.highlightWaterAdjacent =
      this.activeTool === 'producer_water' || this.activeTool === 'producer_sewage';
    if (this.activeTool !== 'inspect') {
      document.getElementById('inspector-panel').classList.remove('visible');
      this.renderer.selectedTile = null;
    }
    this.updateBuildInfoPanel(this.activeTool);
    // On mobile, close the off-canvas tool drawer once a tool is picked so the map is visible again.
    document.querySelector('.tool-drawer')?.classList.remove('mobile-open');
  }

  bindCanvasEvents() {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.isRightMouseDown = true;
      } else if (e.button === 0) {
        this.isMouseDown = true;
        this.handleCanvasClick(e);
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.isRightMouseDown = false;
      if (e.button === 0) this.isMouseDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.isRightMouseDown) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.renderer.setCamera(this.renderer.cameraX + dx, this.renderer.cameraY + dy);
      } else {
        const tile = this.screenToTile(mouseX, mouseY);
        this.renderer.hoverTile = tile;
        if (this.isMouseDown && this.activeTool !== 'inspect') {
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

    if (this.activeTool === 'inspect' || this.activeTool === 'pan') {
      this.renderer.selectedTile = tile;
      document.getElementById('inspector-panel').classList.add('visible');
      this.updateInspector(tile);
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
      const income = this.simulation.tick(!this.simulation.isPaused);
      this.treasury += income;
      this.updateHUD();
      if (this.renderer.selectedTile) {
        this.updateInspector(this.renderer.selectedTile);
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
        if (pType === PRODUCER_TYPE.HOSPITAL) {
          const cap = (staff) => staff * MEDICAL_CONFIG.HOSPITAL_PATIENT_CAPACITY_PER_JOB;
          rows.push(row('Patient Capacity (L/M/H)', `${cap(config.jobs.light)} / ${cap(config.jobs.medium)} / ${cap(config.jobs.high)}`));
        }
      } else if (config.surveyDuration) {
        rows.push(row('Survey Duration (Flat/Mountain)', `${config.surveyDuration.standard} / ${config.surveyDuration.mountain} ticks`));
      }

      body.innerHTML = rows.join('');
      panel.classList.add('visible');
    } else if (tool === 'zone_r' || tool === 'zone_c' || tool === 'zone_i') {
      const zoneType = tool === 'zone_r' ? ZONE.RESIDENTIAL : tool === 'zone_c' ? ZONE.COMMERCIAL : ZONE.INDUSTRIAL;
      const cost = tool === 'zone_i' ? COSTS.INDUSTRIAL_ZONE : COSTS.ZONE;
      title.textContent = tool === 'zone_r' ? 'Residential Zone' : tool === 'zone_c' ? 'Commercial Zone' : 'Industrial Zone';

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

      body.innerHTML = rows.join('');
      panel.classList.add('visible');
    } else {
      panel.classList.remove('visible');
    }
  }

  updateInspector(tile) {
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
    if (popJobsEl) {
      if (tile.zone === ZONE.RESIDENTIAL) {
        const cur = (tile.population || 0).toLocaleString();
        const max = (tile.maxPopulation || RESIDENTIAL_CAPACITY[tile.density] || 0).toLocaleString();
        popJobsEl.textContent = `${cur} / ${max} residents`;
      } else if (tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
        const filled = (tile.filledJobs || 0).toLocaleString();
        const total = (tile.totalJobs || JOBS_PROVIDED[tile.zone]?.[tile.density] || 0).toLocaleString();
        popJobsEl.textContent = `${filled} / ${total} jobs filled`;
      } else if (tile.producer && PRODUCER_CONFIG[tile.producer.type]?.jobs) {
        const filled = (tile.producer.filledJobs || 0).toLocaleString();
        const total = (tile.producer.totalJobs || 0).toLocaleString();
        popJobsEl.textContent = `${filled} / ${total} jobs filled`;
      } else {
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

    document.getElementById('inspect-growth').textContent = tile.zone !== ZONE.NONE ? tile.growthScore : 'N/A';
    document.getElementById('inspect-pollution').textContent = tile.pollution;

    const crime = tile.crime || 0;
    const crimeLevel = crime <= 0 ? 'Safe' : crime < CRIME_CONFIG.CRIME_PENALTY_THRESHOLD ? 'Moderate' : 'High Crime';
    document.getElementById('inspect-crime').textContent = crimeLevel;
    const crimeTaxPenalty = Math.min(CRIME_CONFIG.MAX_TAX_LOSS_RATIO, crime * CRIME_CONFIG.TAX_LOSS_PER_CRIME_POINT);
    document.getElementById('inspect-crime-tax-loss').textContent = `-${Math.round(crimeTaxPenalty * 100)}%`;
    document.getElementById('inspect-fire').textContent = tile.onFire
      ? `Yes (Damage: ${Math.min(100, Math.round(tile.fireDamage || 0))}%)`
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

    const isConnected = this.grid.isRoadAdjacent(tile.x, tile.y);
    document.getElementById('inspect-connected').textContent = isConnected ? 'Yes' : 'No';

    const formatUtil = (key) => {
      if (tile.producer) {
        const producerConfig = PRODUCER_CONFIG[tile.producer.type];
        if (producerConfig?.utility === key) {
          return 'Produces This Utility';
        }
        const usage = producerConfig?.utilityUsage;
        if (usage && (usage[key] > 0 || producerConfig?.activeUtilityUsage?.[key] > 0)) {
          if (!isConnected) return 'No Local Road';
          return tile.producer.utilityShortfall?.[key] ? 'Shortfall (Building Offline)' : 'Serviced';
        }
        return 'Not Required';
      }

      const d = tile.distanceToProducer[key];
      if (d === Infinity) {
        if (!isConnected) return 'No Local Road';
        const prods = key === 'power'
          ? this.grid.producers.filter((p) => POWER_PRODUCER_TYPES.includes(p.type))
          : this.grid.producers.filter((p) => p.type === (key === 'water' ? 'water_tower' : 'sewage_plant'));
        if (prods.length === 0) return 'No Producer Built';
        const prodHasRoad = prods.some((p) => this.grid.isRoadAdjacent(p.x, p.y));
        if (!prodHasRoad) return 'Producer Needs Road!';
        return 'Unconnected Road Network!';
      }
      return tile.shortfall[key] ? `Dist ${d} (Plant Full!)` : `Dist ${d} (Serviced)`;
    };

    document.getElementById('inspect-power').textContent = formatUtil('power');
    document.getElementById('inspect-water').textContent = formatUtil('water');
    document.getElementById('inspect-sewage').textContent = formatUtil('sewage');

    const prodPanel = document.getElementById('producer-details');
    if (tile.producer) {
      prodPanel.style.display = 'block';
      const config = PRODUCER_CONFIG[tile.producer.type];
      const prodHasRoad = this.grid.isRoadAdjacent(tile.producer.x, tile.producer.y);
      const isBatteryDependent = tile.producer.type === PRODUCER_TYPE.WINDMILL || tile.producer.type === PRODUCER_TYPE.SOLAR_PANEL;
      const roadStatusStr = prodHasRoad || isBatteryDependent ? '' : ' ⚠️ (Needs Road!)';
      const utilityStatusStr = PRODUCER_CONFIG[tile.producer.type]?.utilityUsage && !tile.producer.operational
        ? ' ⚠️ (Needs Utilities!)'
        : '';
      const contaminatedStr = tile.producer.contaminated ? ' ☣️ Contaminated!' : '';
      document.getElementById('inspect-producer-type').textContent = (config ? config.name : tile.producer.type) + roadStatusStr + utilityStatusStr + contaminatedStr;

      if (isBatteryDependent && !tile.producer.hasBatteryConnection) {
        document.getElementById('inspect-producer-cap').textContent = '⚠️ Offline (Must be adjacent to Battery Storage)';
      } else if (tile.producer.type === PRODUCER_TYPE.BATTERY) {
        document.getElementById('inspect-producer-cap').textContent = `${tile.producer.usedCapacity} / ${tile.producer.capacity} (Stored: ${Math.round(tile.producer.storedEnergy || 0)} / ${tile.producer.maxStorage})`;
      } else {
        document.getElementById('inspect-producer-cap').textContent = `${tile.producer.usedCapacity} / ${tile.producer.capacity}`;
      }
    } else {
      prodPanel.style.display = 'none';
    }
  }

  startRenderLoop() {
    const loop = () => {
      this.renderer.render(this.simulation);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new GameApp();
});
