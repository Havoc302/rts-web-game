import { PRODUCER_TYPE, POWER_PRODUCER_TYPES, ZONE } from '../config.js';
import { UtilityManager } from './UtilityManager.js';

const GENERATOR_TYPES = POWER_PRODUCER_TYPES.filter((type) => type !== PRODUCER_TYPE.BATTERY);

export const TUTORIAL_STEPS = [
  {
    title: 'Step 1: Lay a Road Network',
    desc: 'Everything must be built next to a road. Place at least 5 road tiles, running beside a river so water and sewage buildings can touch both.',
    check: (grid) => grid.activeRoadTiles.size >= 5,
  },
  {
    title: 'Step 2: Core Utilities (Power, Water, Sewage)',
    desc: 'Beside your roads, place 1 Power Producer, 1 Water Pump, and 1 Sewage Plant, each touching a road. Pumps and sewage plants must also touch water; renewables need an adjacent road-connected Battery Storage.',
    check: (grid) => {
      const connected = (p) => UtilityManager.contributesPowerToGrid(grid, p);
      const hasPower = grid.producers.some((p) => GENERATOR_TYPES.includes(p.type) && connected(p));
      const hasWater = grid.producers.some((p) => p.type === PRODUCER_TYPE.WATER_TOWER && connected(p));
      const hasSewage = grid.producers.some((p) => p.type === PRODUCER_TYPE.SEWAGE_PLANT && connected(p));
      return hasPower && hasWater && hasSewage;
    },
  },
  {
    title: 'Step 3: Residential & Agriculture',
    desc: 'Zone Residential (green) for housing and Agricultural (lime) for local food production.',
    check: (grid) => {
      const tiles = Array.from(grid.getActiveZonedTiles());
      return tiles.some((t) => t.zone === ZONE.RESIDENTIAL) && tiles.some((t) => t.zone === ZONE.AGRICULTURAL);
    },
  },
  {
    title: 'Step 4: Commercial & Industrial Jobs',
    desc: 'Place Commercial or Industrial zones adjacent to roads to provide employment for your workforce.',
    check: (grid) => Array.from(grid.getActiveZonedTiles()).some((t) => t.zone === ZONE.COMMERCIAL || t.zone === ZONE.INDUSTRIAL),
  },
  {
    title: 'Step 5: Unpause & Grow',
    desc: 'Set your desired tax rate then unpause the simulation (1x speed or higher) and watch your town start growing.',
    check: (grid, stats) => stats.population > 0,
  },
];

export class TutorialManager {
  constructor(app) {
    this.app = app;
    this.welcomeKey = 'simconquer_welcome_dismissed';
    this.tutorialEnabledKey = 'simconquer_tutorial_enabled';
    this.stepKey = 'simconquer_tutorial_step';

    this.isEnabled = localStorage.getItem(this.tutorialEnabledKey) !== 'false';
    this.currentStep = parseInt(localStorage.getItem(this.stepKey), 10) || 0;
    this.steps = TUTORIAL_STEPS;

    this.bindUI();
    this.checkWelcomeModal();
    this.renderBanner();
  }

  checkWelcomeModal() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal && localStorage.getItem(this.welcomeKey) !== 'true') {
      welcomeModal.style.display = 'flex';
    }
  }

  bindUI() {
    const welcomeModal = document.getElementById('welcome-modal');
    const dontShowChk = document.getElementById('chk-welcome-dont-show');
    const settingsToggle = document.getElementById('chk-toggle-tooltips');

    if (settingsToggle) {
      settingsToggle.checked = this.isEnabled;
      settingsToggle.addEventListener('change', (e) => this.setTutorialEnabled(e.target.checked));
    }

    const handleWelcomeClose = (startSteps) => {
      if (dontShowChk?.checked) localStorage.setItem(this.welcomeKey, 'true');
      if (welcomeModal) welcomeModal.style.display = 'none';
      if (startSteps) this.restart();
      else this.setTutorialEnabled(false);
    };

    document.getElementById('btn-start-tutorial')?.addEventListener('click', () => handleWelcomeClose(true));
    document.getElementById('btn-skip-welcome')?.addEventListener('click', () => handleWelcomeClose(false));
    document.getElementById('btn-dismiss-tutorial')?.addEventListener('click', () => this.setTutorialEnabled(false));
  }

  restart() {
    this.currentStep = 0;
    localStorage.setItem(this.stepKey, '0');
    this.setTutorialEnabled(true);
  }

  setTutorialEnabled(enabled) {
    this.isEnabled = enabled;
    localStorage.setItem(this.tutorialEnabledKey, String(enabled));

    const settingsToggle = document.getElementById('chk-toggle-tooltips');
    if (settingsToggle) settingsToggle.checked = enabled;

    this.renderBanner();
  }

  update(grid, stats) {
    if (!this.isEnabled || this.currentStep >= this.steps.length) return;

    // Advance through every step already satisfied (e.g. after loading a save).
    let advanced = false;
    while (this.currentStep < this.steps.length && this.steps[this.currentStep].check(grid, stats)) {
      this.currentStep++;
      advanced = true;
    }
    if (advanced) {
      localStorage.setItem(this.stepKey, String(this.currentStep));
      this.renderBanner();
    }
  }

  renderBanner() {
    const banner = document.getElementById('tutorial-banner');
    if (!banner) return;

    if (!this.isEnabled || this.currentStep >= this.steps.length) {
      banner.style.display = 'none';
      return;
    }

    const step = this.steps[this.currentStep];
    banner.style.display = 'flex';
    document.getElementById('tutorial-step-title').textContent = step.title;
    document.getElementById('tutorial-step-desc').textContent = step.desc;
  }
}
