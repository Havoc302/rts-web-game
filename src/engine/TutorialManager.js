import { PRODUCER_TYPE, POWER_PRODUCER_TYPES, ZONE } from '../config.js';
import { UtilityManager } from './UtilityManager.js';

const GENERATOR_TYPES = POWER_PRODUCER_TYPES.filter((type) => type !== PRODUCER_TYPE.BATTERY);

export const TUTORIAL_STEPS = [
  {
    title: 'Step 1: Select a map tile',
    desc: 'Select a land tile on the globe, then choose Open Map.',
    check: (grid, stats, app) => Boolean(app?.currentCellId),
  },
  {
    title: 'Step 2: Lay a Road Network',
    desc: 'Everything must be built next to a road. Place at least 5 road tiles, running beside a river so water and sewage buildings can touch both.',
    check: (grid) => grid.activeRoadTiles.size >= 5,
  },
  {
    title: 'Step 3: Core Utilities (Power, Water, Sewage)',
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
    title: 'Step 4: Residential & Agriculture',
    desc: 'Zone Residential (green) for housing and Agricultural (lime) for local food production.',
    check: (grid) => {
      const tiles = Array.from(grid.getActiveZonedTiles());
      return tiles.some((t) => t.zone === ZONE.RESIDENTIAL) && tiles.some((t) => t.zone === ZONE.AGRICULTURAL);
    },
  },
  {
    title: 'Step 5: Commercial & Industrial Jobs',
    desc: 'Place Commercial or Industrial zones adjacent to roads to provide employment for your workforce.',
    check: (grid) => Array.from(grid.getActiveZonedTiles()).some((t) => t.zone === ZONE.COMMERCIAL || t.zone === ZONE.INDUSTRIAL),
  },
  {
    title: 'Step 6: Unpause & Grow',
    desc: 'Set your desired tax rate then unpause the simulation (1x speed or higher) and watch your town start growing.',
    check: (grid, stats) => stats.population > 0,
  },
];

export class TutorialManager {
  constructor(app) {
    this.app = app;
    this.tutorialEnabledKey = 'simconquer_tutorial_enabled';
    this.stepKey = 'simconquer_tutorial_step';

    this.isEnabled = localStorage.getItem(this.tutorialEnabledKey) !== 'false';
    this.currentStep = app.currentCellId ? parseInt(localStorage.getItem(this.stepKey), 10) || 0 : 0;
    this.steps = TUTORIAL_STEPS;

    this.bindUI();
    this.renderBanner();
  }

  bindUI() {
    // The Guided Tutorial button in the main menu is the single on/off control.
    const tutorialButton = document.getElementById('btn-main-tutorial');
    if (tutorialButton) {
      tutorialButton.addEventListener('click', () => this.setTutorialEnabled(!this.isEnabled));
    }
    this.syncTutorialButton();

    document.getElementById('btn-dismiss-tutorial')?.addEventListener('click', () => this.setTutorialEnabled(false));
  }

  /** Keeps the main-menu toggle's label and pressed state matching the preference. */
  syncTutorialButton() {
    const button = document.getElementById('btn-main-tutorial');
    if (!button) return;
    button.textContent = `🎓 Tutorial: ${this.isEnabled ? 'On' : 'Off'}`;
    button.classList.toggle('active', this.isEnabled);
    button.setAttribute('aria-pressed', String(this.isEnabled));
  }

  restart() {
    this.currentStep = 0;
    localStorage.setItem(this.stepKey, '0');
    this.setTutorialEnabled(true);
  }

  setTutorialEnabled(enabled) {
    this.isEnabled = enabled;
    localStorage.setItem(this.tutorialEnabledKey, String(enabled));

    this.syncTutorialButton();
    this.renderBanner();
  }

  update(grid, stats) {
    if (!this.isEnabled || this.currentStep >= this.steps.length) return;

    // Advance through every step already satisfied (e.g. after loading a save).
    let advanced = false;
    while (this.currentStep < this.steps.length && this.steps[this.currentStep].check(grid, stats, this.app)) {
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

    // No world is loaded yet (title screen), so there is nothing to guide the player through.
    const idle = this.app?.worldActive === false;
    if (!this.isEnabled || idle || this.currentStep >= this.steps.length) {
      banner.style.display = 'none';
      return;
    }

    const step = this.steps[this.currentStep];
    banner.style.display = 'flex';
    document.getElementById('tutorial-step-title').textContent = step.title;
    document.getElementById('tutorial-step-desc').textContent = step.desc;
  }
}
