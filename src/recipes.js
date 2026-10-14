// Central crafting recipe table.
//
// Every craftable conversion in the game is defined here, for both stations that run
// recipes: the Smelter building and Industrial zone tiles. Nothing else should hard-code
// an input/output ratio, so adding or retuning a recipe is a one-file change.
//
// `inputs` are stockpile units consumed per one unit of output. `outputPerJob` is how much
// one filled job produces per tick. A recipe with empty `inputs` only needs crew.

export const STATION = {
  SMELTER: 'smelter',
  INDUSTRIAL: 'industrial',
};

/**
 * Sentinel recipe id for a Smelter set to share its crew across every recipe it can run.
 * This is the default, so an unconfigured Smelter behaves as it always has.
 */
export const ALL_EVENLY = 'ALL_EVENLY';

export const RECIPES = {
  // --- Smelter: raw and mined material into bar-tier goods -----------------------------
  // A smelter's energy comes from the power grid, not from its inputs: the building carries
  // `utilityUsage.power` and goes offline when the grid cannot serve it. Coal is not a
  // general fuel here, it is coking coal - a carbon input for the iron and steel reactions
  // only. Bauxite (electrolytic aluminium), copper, glass and polysilicon therefore burn no
  // coal at all.
  IRON_BAR: {
    station: STATION.SMELTER,
    label: 'Iron Bars',
    inputs: { ironOre: 1, coal: 0.5 },
    output: 'ironBar',
    outputPerJob: 0.2,
  },
  BAUXITE_BAR: {
    station: STATION.SMELTER,
    label: 'Bauxite Bars',
    inputs: { bauxiteOre: 1 },
    output: 'bauxiteBar',
    outputPerJob: 0.2,
  },
  STEEL: {
    station: STATION.SMELTER,
    label: 'Steel',
    inputs: { ironOre: 1, coal: 1 },
    output: 'steel',
    outputPerJob: 0.2,
  },
  COPPER_BAR: {
    station: STATION.SMELTER,
    label: 'Copper Bars',
    inputs: { copperOre: 1 },
    output: 'copperBar',
    outputPerJob: 0.2,
  },
  GLASS: {
    station: STATION.SMELTER,
    label: 'Glass',
    inputs: { sand: 1 },
    output: 'glass',
    outputPerJob: 0.2,
  },
  POLYSILICON: {
    station: STATION.SMELTER,
    label: 'Polysilicon',
    inputs: { sand: 1 },
    output: 'polysilicon',
    outputPerJob: 0.2,
  },

  // --- Industrial zone tiles ------------------------------------------------------------
  CONSUMER_GOODS: {
    station: STATION.INDUSTRIAL,
    label: 'Consumer Goods',
    inputs: { bauxiteBar: 0.5, ironBar: 0.5, oil: 1 },
    output: 'consumerGoods',
    outputPerJob: 0.2,
  },
  FOOD: {
    station: STATION.INDUSTRIAL,
    label: 'Food',
    inputs: {},
    output: 'food',
    outputPerJob: 0.1,
  },
  ARMS: {
    station: STATION.INDUSTRIAL,
    label: 'Arms',
    inputs: { ironBar: 0.5 },
    output: 'arms',
    outputPerJob: 0.05,
  },
  TANKS: {
    station: STATION.INDUSTRIAL,
    label: 'Tanks',
    inputs: { ironBar: 1, bauxiteBar: 0.5 },
    output: 'tanks',
    outputPerJob: 0.02,
  },
  COMPUTER_CHIPS: {
    station: STATION.INDUSTRIAL,
    label: 'Computer Chips',
    inputs: { polysilicon: 1, copperBar: 1 },
    output: 'computerChips',
    outputPerJob: 0.2,
  },
};

/** Industrial tiles default to this recipe when nothing else is chosen. */
export const DEFAULT_INDUSTRIAL_RECIPE = 'CONSUMER_GOODS';

export const RECIPE_IDS = Object.keys(RECIPES);

export const SMELTER_RECIPE_IDS = RECIPE_IDS.filter((id) => RECIPES[id].station === STATION.SMELTER);
export const INDUSTRIAL_RECIPE_IDS = RECIPE_IDS.filter((id) => RECIPES[id].station === STATION.INDUSTRIAL);

export function getRecipe(id) {
  return RECIPES[id] || null;
}

/** Recipe ids a station can run, in table order. */
export function recipesForStation(station) {
  return RECIPE_IDS.filter((id) => RECIPES[id].station === station);
}

/** True when every input this recipe needs is on hand. */
export function hasInputs(recipe, stockpile) {
  return Object.entries(recipe.inputs).every(([key, perOutput]) => (stockpile[key] || 0) >= perOutput);
}

/**
 * How much output these jobs can produce right now, capped by crew, by every input, and by
 * the recipe's per-job rate. Zero means the recipe cannot run this tick.
 */
export function recipeOutput(recipe, jobs, stockpile) {
  let possible = Math.max(0, jobs) * recipe.outputPerJob;
  for (const [key, perOutput] of Object.entries(recipe.inputs)) {
    if (perOutput <= 0) continue;
    possible = Math.min(possible, (stockpile[key] || 0) / perOutput);
  }
  return possible > 0 ? possible : 0;
}

/** Consumes the inputs and banks the output for `amount` units. Returns the amount produced. */
export function applyRecipe(recipe, amount, stockpile) {
  if (!(amount > 0)) return 0;
  for (const [key, perOutput] of Object.entries(recipe.inputs)) {
    stockpile[key] -= amount * perOutput;
  }
  stockpile[recipe.output] = (stockpile[recipe.output] || 0) + amount;
  return amount;
}

/** Runs one recipe for a crew and returns the output produced. */
export function runRecipe(recipe, jobs, stockpile) {
  return applyRecipe(recipe, recipeOutput(recipe, jobs, stockpile), stockpile);
}
