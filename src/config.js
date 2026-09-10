// Current public release version. Increment patch for fixes, minor for compatible features, major for breaking changes.
export const APP_VERSION = '0.1.0';

export const MAP_WIDTH = 200;
export const MAP_HEIGHT = 200;
export const GRID_WIDTH = MAP_WIDTH;
export const GRID_HEIGHT = MAP_HEIGHT;
export const TILE_SIZE = 32;
export const MONEY_MULTIPLIER = 10;
export const STARTING_TREASURY = 2500 * MONEY_MULTIPLIER;

export const TERRAIN = {
  FLAT: 'flat',
  MOUNTAIN: 'mountain',
  WATER: 'water',
  FOREST: 'forest',
};

export const TERRAIN_TYPE = {
  EMPTY: TERRAIN.FLAT,
  RIVER: TERRAIN.WATER,
  ROCK: TERRAIN.MOUNTAIN,
  FOREST: TERRAIN.FOREST,
};

export const ZONE = {
  NONE: 'none',
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
};

export const DENSITY = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const SERVICE_TYPE = {
  POLICE_STATION: 'police_station',
  FIRE_STATION: 'fire_station',
  HOSPITAL: 'hospital',
  SCHOOL: 'school',
  LIBRARY: 'library',
  CITY_HALL: 'city_hall',
};

export const PRODUCER_TYPE = {
  POWER_PLANT: 'power_plant',
  WINDMILL: 'windmill',
  SOLAR_PANEL: 'solar_panel',
  BATTERY: 'battery',
  COAL_PLANT: 'coal_plant',
  NUCLEAR_PLANT: 'nuclear_plant',
  WATER_TOWER: 'water_tower',
  SEWAGE_PLANT: 'sewage_plant',
  SURVEY_STATION: 'survey_station',
  MINE_IRON: 'mine_iron',
  MINE_BAUXITE: 'mine_bauxite',
  MINE_COAL: 'mine_coal',
  WAREHOUSE_ORE: 'warehouse_ore',
  WAREHOUSE_BAR: 'warehouse_bar',
  WAREHOUSE_GOODS: 'warehouse_goods',
  SMELTER: 'smelter',
  ...SERVICE_TYPE,
};

export const POWER_PRODUCER_TYPES = [
  PRODUCER_TYPE.POWER_PLANT,
  PRODUCER_TYPE.WINDMILL,
  PRODUCER_TYPE.SOLAR_PANEL,
  PRODUCER_TYPE.BATTERY,
  PRODUCER_TYPE.COAL_PLANT,
  PRODUCER_TYPE.NUCLEAR_PLANT,
];

// Day/night cycle: each tick advances the clock by one in-game hour.
export const TICKS_PER_HOUR = 1;
export const HOURS_PER_DAY = 24;
export const DAY_START_HOUR = 6;
export const NIGHT_START_HOUR = 18;
export const NIGHT_TINT_ALPHA = 0.35;

export const WIND_CONFIG = {
  BASE_CAPACITY: 40,
  FLUCTUATION: 25,
  MIN_CAPACITY: 10,
};

export const SOLAR_CONFIG = {
  PEAK_CAPACITY: 60,
};

export const BATTERY_CONFIG = {
  MAX_STORAGE: 400,
  DISCHARGE_RATE: 40,
};

export const COAL_CONFIG = {
  RADIUS: 6,
  EMISSION: 12,
};

export const ORE_TYPE = {
  IRON_ORE: 'iron_ore',
  BAUXITE: 'bauxite',
  COAL: 'coal',
  OIL: 'oil',
};

export const ORE_CONFIG = {
  [ORE_TYPE.IRON_ORE]: { name: 'Iron Ore', color: '#94a3b8' },
  [ORE_TYPE.BAUXITE]: { name: 'Bauxite', color: '#c2410c' },
  [ORE_TYPE.COAL]: { name: 'Coal', color: '#1f2937' },
  [ORE_TYPE.OIL]: { name: 'Oil', color: '#111827' },
};

// Global production, storage, and consumption balance values.
export const RESOURCE_CONFIG = {
  FOOD_PER_RESIDENT: 0.05,              // Food consumed by each resident per tick
  CONSUMER_GOODS_PER_RESIDENT: 0.08,    // Consumer goods demand per resident per tick
  MINE_EXTRACTION_PER_JOB: 0.2,         // Raw resource extracted by one filled mine job per tick
  WAREHOUSE_CAPACITY_PER_TILE: 500,     // Storage capacity provided by one warehouse building
  SMELTER_ORE_PER_BAR: 1.0,             // Ore consumed to produce one metal bar
  SMELTER_COAL_PER_BAR: 0.5,            // Coal consumed to produce one metal bar
  SMELTER_BARS_PER_JOB: 0.2,            // Metal bars produced by one filled smelter job per tick
  COAL_PLANT_FUEL_PER_MW: 0.02,         // Coal consumed per megawatt supplied by a coal plant
};

// Industrial recipe definitions. Input values are stockpile units per output unit.
export const FACTORY_RECIPES = {
  CONSUMER_GOODS: { inputs: {}, output: 'consumerGoods', rate: 0.2 },
  FOOD: { inputs: {}, output: 'food', rate: 0.1 },
  ARMS: { inputs: { ironBar: 0.5 }, output: 'arms', rate: 0.05 },
  TANKS: { inputs: { ironBar: 1.0, bauxiteBar: 0.5 }, output: 'tanks', rate: 0.02 },
};

// Happiness feedback values shared by food and consumer-goods simulation.
export const HAPPINESS_CONFIG = {
  CONSUMER_GOODS_MAX_BONUS: 15,          // Maximum happiness points from meeting goods demand
  UNFED_OUTFLOW_PERCENT: 0.05,            // Population fraction lost from an unfed residential tile per tick
  GROWTH_DELTA_PER_POINT: 0.05,           // Residential growth delta per happiness point
  UNTREATED_PATIENT_PENALTY: 0.5,         // Happiness penalty per untreated patient
  CRIME_POINT_PENALTY: 0.5,               // Happiness penalty per crime point
  FIRE_INJURY_PENALTY: 0.1,               // Happiness penalty per fire injury
};

export const ORE_GENERATION = {
  [TERRAIN.FLAT]: 0.03,
  [TERRAIN.FOREST]: 0.015,
  [TERRAIN.MOUNTAIN]: 0.35,
  [TERRAIN.WATER]: 0.01,
};

export const SERVICE_CONFIG = {
  [SERVICE_TYPE.POLICE_STATION]: {
    name: 'Police Station',
    category: 'service',
    cost: 400 * MONEY_MULTIPLIER,
    color: '#3b82f6',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 500, high: 2500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 2 * MONEY_MULTIPLIER, medium: 8 * MONEY_MULTIPLIER, high: 24 * MONEY_MULTIPLIER },
    runningCostPerJob: 0.2 * MONEY_MULTIPLIER,
    unique: false,
  },
  [SERVICE_TYPE.FIRE_STATION]: {
    name: 'Fire Department',
    category: 'service',
    cost: 400 * MONEY_MULTIPLIER,
    color: '#ef4444',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 500, high: 2500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 2 * MONEY_MULTIPLIER, medium: 8 * MONEY_MULTIPLIER, high: 24 * MONEY_MULTIPLIER },
    runningCostPerJob: 0.2 * MONEY_MULTIPLIER,
    unique: false,
  },
  [SERVICE_TYPE.HOSPITAL]: {
    name: 'Hospital & Ambulance',
    category: 'service',
    cost: 600 * MONEY_MULTIPLIER,
    color: '#10b981',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 750, high: 3500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 2, water: 2, sewage: 2 },
    runningCost: { light: 4 * MONEY_MULTIPLIER, medium: 14 * MONEY_MULTIPLIER, high: 40 * MONEY_MULTIPLIER },
    runningCostPerJob: 0.4 * MONEY_MULTIPLIER,
    unique: false,
  },
  [SERVICE_TYPE.SCHOOL]: {
    name: 'School',
    category: 'service',
    cost: 350 * MONEY_MULTIPLIER,
    color: '#f59e0b',
    radius: { light: 8, medium: 15, high: 25 },
    jobs: { light: 10, medium: 40, high: 150 },
    popThresholds: { medium: 300, high: 1500 },
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 2 * MONEY_MULTIPLIER, medium: 7 * MONEY_MULTIPLIER, high: 20 * MONEY_MULTIPLIER },
    runningCostPerJob: 0.2 * MONEY_MULTIPLIER,
    unique: false,
  },
  [SERVICE_TYPE.LIBRARY]: {
    name: 'Public Library',
    category: 'service',
    cost: 250 * MONEY_MULTIPLIER,
    color: '#8b5cf6',
    radius: { light: 8, medium: 14, high: 22 },
    jobs: { light: 5, medium: 20, high: 75 },
    popThresholds: { medium: 200, high: 1000 },
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 1 * MONEY_MULTIPLIER, medium: 5 * MONEY_MULTIPLIER, high: 14 * MONEY_MULTIPLIER },
    runningCostPerJob: 0.1 * MONEY_MULTIPLIER,
    unique: false,
  },
  [SERVICE_TYPE.CITY_HALL]: {
    name: 'City Hall',
    category: 'civic',
    cost: 1000 * MONEY_MULTIPLIER,
    color: '#eab308',
    radius: { light: 30, medium: 45, high: 60 },
    jobs: { light: 30, medium: 100, high: 300 },
    popThresholds: { medium: 1000, high: 5000 },
    utilityUsage: { power: 2, water: 2, sewage: 2 },
    unique: true,
  },
};

export const PRODUCER_CONFIG = {
  [PRODUCER_TYPE.POWER_PLANT]: {
    name: 'Power Plant',
    utility: 'power',
    capacity: 100,
    cost: 500 * MONEY_MULTIPLIER,
    color: '#f39c12',
    requiresWaterAdjacent: false,
    utilityUsage: { water: 1, sewage: 1 },
  },
  [PRODUCER_TYPE.WINDMILL]: {
    name: 'Windmill',
    utility: 'power',
    capacity: WIND_CONFIG.BASE_CAPACITY,
    cost: 150 * MONEY_MULTIPLIER,
    color: '#94a3b8',
    requiresWaterAdjacent: false,
    requiresBatteryAdjacent: true,
  },
  [PRODUCER_TYPE.SOLAR_PANEL]: {
    name: 'Solar Panel',
    utility: 'power',
    capacity: SOLAR_CONFIG.PEAK_CAPACITY,
    cost: 200 * MONEY_MULTIPLIER,
    color: '#fbbf24',
    requiresWaterAdjacent: false,
    requiresBatteryAdjacent: true,
  },
  [PRODUCER_TYPE.BATTERY]: {
    name: 'Battery Storage',
    utility: 'power',
    capacity: BATTERY_CONFIG.MAX_STORAGE,
    cost: 300 * MONEY_MULTIPLIER,
    color: '#22c55e',
    requiresWaterAdjacent: false,
    utilityUsage: { water: 1, sewage: 1 },
  },
  [PRODUCER_TYPE.COAL_PLANT]: {
    name: 'Coal Power Plant',
    utility: 'power',
    capacity: 300,
    cost: 1250 * MONEY_MULTIPLIER,
    color: '#57534e',
    requiresWaterAdjacent: false,
    utilityUsage: { water: 1, sewage: 1 },
  },
  [PRODUCER_TYPE.NUCLEAR_PLANT]: {
    name: 'Nuclear Power Plant',
    utility: 'power',
    capacity: 800,
    cost: 2500 * MONEY_MULTIPLIER,
    color: '#a3e635',
    requiresWaterAdjacent: true,
    utilityUsage: { water: 1, sewage: 1 },
  },
  [PRODUCER_TYPE.WATER_TOWER]: {
    name: 'Water Pump',
    utility: 'water',
    capacity: 120,
    cost: 300 * MONEY_MULTIPLIER,
    color: '#3498db',
    requiresWaterAdjacent: true,
    utilityUsage: { power: 2, sewage: 1 },
  },
  [PRODUCER_TYPE.SEWAGE_PLANT]: {
    name: 'Sewage Plant',
    utility: 'sewage',
    capacity: 120,
    cost: 400 * MONEY_MULTIPLIER,
    color: '#8e44ad',
    requiresWaterAdjacent: true,
    utilityUsage: { power: 2, water: 1 },
  },
  [PRODUCER_TYPE.SURVEY_STATION]: {
    name: 'Survey Station',
    category: 'utility',
    cost: 750 * MONEY_MULTIPLIER,
    capacity: 0,
    color: '#14b8a6',
    utilityUsage: { power: 2, water: 1, sewage: 1 },
    activeUtilityUsage: { power: 10 },
    surveyDuration: { standard: 10, mountain: 20 },
    unique: false,
  },
  [PRODUCER_TYPE.MINE_IRON]: {
    name: 'Iron Mine', category: 'resource', utility: 'resource', capacity: 0,
    cost: 500 * MONEY_MULTIPLIER, color: '#94a3b8',
    requiresDiscoveredOre: ORE_TYPE.IRON_ORE,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    jobs: { light: 10, medium: 10, high: 10 },
  },
  [PRODUCER_TYPE.MINE_BAUXITE]: {
    name: 'Bauxite Mine', category: 'resource', utility: 'resource', capacity: 0,
    cost: 500 * MONEY_MULTIPLIER, color: '#c2410c',
    requiresDiscoveredOre: ORE_TYPE.BAUXITE,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    jobs: { light: 10, medium: 10, high: 10 },
  },
  [PRODUCER_TYPE.MINE_COAL]: {
    name: 'Coal Mine', category: 'resource', utility: 'resource', capacity: 0,
    cost: 500 * MONEY_MULTIPLIER, color: '#1f2937',
    requiresDiscoveredOre: ORE_TYPE.COAL,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    jobs: { light: 10, medium: 10, high: 10 },
  },
  [PRODUCER_TYPE.WAREHOUSE_ORE]: {
    name: 'Ore Warehouse', category: 'storage', utility: 'storage', capacity: 0,
    cost: 400 * MONEY_MULTIPLIER, color: '#78716c',
    utilityUsage: { power: 1, water: 0, sewage: 0 },
  },
  [PRODUCER_TYPE.WAREHOUSE_BAR]: {
    name: 'Bar Warehouse', category: 'storage', utility: 'storage', capacity: 0,
    cost: 500 * MONEY_MULTIPLIER, color: '#b45309',
    utilityUsage: { power: 1, water: 0, sewage: 0 },
  },
  [PRODUCER_TYPE.WAREHOUSE_GOODS]: {
    name: 'Goods Warehouse', category: 'storage', utility: 'storage', capacity: 0,
    cost: 600 * MONEY_MULTIPLIER, color: '#2563eb',
    utilityUsage: { power: 1, water: 0, sewage: 0 },
  },
  [PRODUCER_TYPE.SMELTER]: {
    name: 'Smelter', category: 'factory', utility: 'factory', capacity: 0,
    cost: 900 * MONEY_MULTIPLIER, color: '#dc2626',
    utilityUsage: { power: 3, water: 2, sewage: 2 },
    jobs: { light: 10, medium: 20, high: 40 },
  },
  ...SERVICE_CONFIG,
};

export const USAGE_RATES = {
  [ZONE.RESIDENTIAL]: {
    [DENSITY.LIGHT]: { power: 1, water: 2, sewage: 2 },
    [DENSITY.MEDIUM]: { power: 2, water: 3, sewage: 3 },
    [DENSITY.HIGH]: { power: 3, water: 5, sewage: 5 },
  },
  [ZONE.COMMERCIAL]: {
    [DENSITY.LIGHT]: { power: 2, water: 1, sewage: 1 },
    [DENSITY.MEDIUM]: { power: 3, water: 2, sewage: 2 },
    [DENSITY.HIGH]: { power: 4, water: 2, sewage: 2 },
  },
  [ZONE.INDUSTRIAL]: {
    [DENSITY.LIGHT]: { power: 1, water: 1, sewage: 1 },
    [DENSITY.MEDIUM]: { power: 3, water: 2, sewage: 2 },
    [DENSITY.HIGH]: { power: 5, water: 3, sewage: 2 },
  },
};

export const GROWTH_CONFIG = {
  SERVICED_DELTA: 1,
  SHORTFALL_DELTA: -2,
  THRESHOLD_MEDIUM: 10,
  THRESHOLD_HIGH: 25,
  MAX_SCORE: 50,
};

export const COSTS = {
  ROAD: 10 * MONEY_MULTIPLIER,
  BRIDGE: 50 * MONEY_MULTIPLIER,
  ZONE: 20 * MONEY_MULTIPLIER,
  INDUSTRIAL_ZONE: 30 * MONEY_MULTIPLIER,
  BULLDOZE: 5 * MONEY_MULTIPLIER,
};

export const ROAD_MAINTENANCE_COST = 1; // Maintenance cost per road or bridge tile per tick

export const TAX_REVENUE_CONFIG = {
  RESIDENTS_PER_TAX_UNIT: 100,
  EMPLOYED_PER_TAX_UNIT: 100,
  MONEY_PER_TAX_UNIT: 1 * MONEY_MULTIPLIER,
};

export const BASE_INCOME = {
  [ZONE.RESIDENTIAL]: {
    [DENSITY.LIGHT]: 1 * MONEY_MULTIPLIER,
    [DENSITY.MEDIUM]: 2 * MONEY_MULTIPLIER,
    [DENSITY.HIGH]: 3 * MONEY_MULTIPLIER,
  },
  [ZONE.COMMERCIAL]: {
    [DENSITY.LIGHT]: 2 * MONEY_MULTIPLIER,
    [DENSITY.MEDIUM]: 4 * MONEY_MULTIPLIER,
    [DENSITY.HIGH]: 6 * MONEY_MULTIPLIER,
  },
  [ZONE.INDUSTRIAL]: {
    [DENSITY.LIGHT]: 3 * MONEY_MULTIPLIER,
    [DENSITY.MEDIUM]: 6 * MONEY_MULTIPLIER,
    [DENSITY.HIGH]: 9 * MONEY_MULTIPLIER,
  },
};

export const POLLUTION_CONFIG = {
  // Industrial pollution footprint and strength by zone density.
  INDUSTRIAL_RADIUS: { light: 3, medium: 5, high: 7 },
  INDUSTRIAL_EMISSION: { light: 2, medium: 5, high: 10 },

  // Pollution created when sewage service is unavailable.
  SEWAGE_BACKUP_RADIUS: 4,
  SEWAGE_BACKUP_EMISSION: 6,

  // Pollution lost by river water as it moves downstream.
  RIVER_SEWAGE_FALLOFF: 10,
  RIVER_FLOW_DOWNSTREAM_THRESHOLD: 0.5,

  // Pollution spread by a water tower supplied by contaminated water.
  CONTAMINATED_TOWER_RADIUS: 8,
  CONTAMINATED_TOWER_EMISSION: 15,

  // Pollution levels that affect development and display.
  POLLUTION_GROWTH_PENALTY_THRESHOLD: 5,
  POLLUTION_GROWTH_PENALTY: -1,
  RIVER_POLLUTION_LEVEL_MAX_DISPLAY: 30,
  POLLUTION_DISPLAY_THRESHOLD: 0.5,

  RIVER_FLOW_DIRECTION: 'south',
};

export const RESIDENTIAL_CAPACITY = {
  [DENSITY.LIGHT]: 25,
  [DENSITY.MEDIUM]: 125,
  [DENSITY.HIGH]: 500,
};

export const JOBS_PROVIDED = {
  [ZONE.COMMERCIAL]: {
    [DENSITY.LIGHT]: 30,
    [DENSITY.MEDIUM]: 150,
    [DENSITY.HIGH]: 600,
  },
  [ZONE.INDUSTRIAL]: {
    [DENSITY.LIGHT]: 40,
    [DENSITY.MEDIUM]: 200,
    [DENSITY.HIGH]: 800,
  },
};

export const EMPLOYABLE_POPULATION = RESIDENTIAL_CAPACITY;

export const LABOR_TAX_GROWTH_CONFIG = {
  // Employment thresholds and deltas used by commercial/industrial growth.
  EMPLOYMENT_BONUS_MAX: 1,
  EMPLOYMENT_RATE_HIGH: 0.75,
  EMPLOYMENT_RATE_LOW: 0.25,
  EMPLOYMENT_SHORTAGE_PENALTY: -1,
  MIN_SERVICE_EMPLOYMENT_RATE: 0.3,

  // Tax pressure and its effect on population and jobs.
  LOW_TAX_GROWTH_BONUS: 1,
  GROWTH_NEUTRAL_RATE: 40,
  POPULATION_OUTFLOW_START_RATE: 50,
  MAX_TAX_RATE: 100,
  MAX_OUTFLOW_GROWTH_PENALTY: 4,
  MAX_HIGH_TAX_JOBS_REDUCTION: 0.5,
};

export const FOREST_POLLUTION_ABSORPTION = 6;
export const FOREST_DESIRABILITY_RADIUS = 3;

export const CRIME_CONFIG = {
  // Crime probability and event volume.
  BASE_CRIME_CHANCE: 0.05,            // Baseline probability of crime spawning per tick
  JOB_SCARCITY_CRIME_SCALER: 2.5,     // Scales crime probability with job scarcity (residents who want work but have none), not raw unemployment
  CRIME_EVENTS_PER_TICK_MAX: 15,      // Max zoned tiles hit per tick
  POLICE_SUPPRESSION_CHANCE: 0.85,    // 85% chance police presence cancels a crime event on a tile

  // Crime severity, spread, decay, and growth impact.
  CRIME_PENALTY_THRESHOLD: 3,         // Crime level triggering growth score penalties
  CRIME_DISSIPATION_RATE: 1,          // Natural crime decay rate per tick
  CRIME_GROWTH_PENALTY: -2,           // Growth delta applied when crime reaches the penalty threshold
  CRIME_INCREMENT_PER_EVENT: 2,        // Crime points added by a successful event
  CRIME_DIFFUSION_THRESHOLD: 4,        // Crime level required before spreading to neighbors
  CRIME_DIFFUSION_INCREMENT: 1,        // Crime points added to each diffused neighbor
  MAX_CRIME_LEVEL: 10,                 // Maximum crime points on one tile

  // Tax loss caused by crime.
  TAX_LOSS_PER_CRIME_POINT: 0.05,     // Each crime point reduces tile tax yield by 5%
  MAX_TAX_LOSS_RATIO: 0.50,           // Capped at 50% max tax loss per tile
};

export const MEDICAL_CONFIG = {
  PATIENTS_PER_RESIDENT: 0.01,            // Baseline passive sickness rate per resident
  PATIENTS_PER_INDUSTRIAL_JOB: 0.05,      // Higher injury rate per filled industrial job
  PATIENTS_PER_CRIME_POINT: 0.5,          // Additional trauma patients per point of tile crime
  PATIENTS_PER_POLLUTION_POINT: 0.2,      // Additional sickness per point of tile pollution
  HOSPITAL_PATIENT_CAPACITY_PER_JOB: 15,  // Patient capacity provided per staffed hospital job
  UNHEALTHY_GROWTH_PENALTY: -2,           // Growth penalty on residential tiles during hospital shortfall
};

export const FIRE_CONFIG = {
  BASE_IGNITION_CHANCE: 0.0001,           // Fixed standalone infrastructure chance: 0.01% per tick
  FOREST_IGNITION_CHANCE: 0.0001,         // Fixed forest ignition chance: 0.01% per tick
  MAX_IGNITION_CHANCE_NON_INDUSTRIAL: 0.01, // Maximum occupied tile risk (1% per tick)
  MAX_IGNITION_CHANCE_INDUSTRIAL: 0.02,   // Maximum occupied industrial tile risk (2% per tick)
  HIGH_POLLUTION_IGNITION_THRESHOLD: 5,   // Pollution level at which ignition becomes more likely
  HIGH_POLLUTION_IGNITION_BONUS: 0.003,   // Extra chance if tile pollution >= 5
  BURNING_POPULATION_RELOCATION_RATE: 0.5, // Share of residents relocated from a burning home tile per fire tick
  DAMAGE_PER_TICK: 10,                    // Fire damage accumulated per tick (10 ticks to reach 100)
  MAX_DAMAGE: 100,                         // Damage threshold that destroys the burning building
  SPREAD_CHANCE_PER_TICK: 0.15,           // Chance to ignite an adjacent non-dirt/road tile per tick
  INJURIES_PER_BURNING_TILE: 5,           // Burn trauma patients added to hospital demand per active fire tick
  BASE_SUPPRESSION_POWER: 35,             // Base fire suppression points per tick from nearby fire stations
};

// Global service staffing, coverage, and operating-cost balance controls.
export const SERVICE_GLOBAL_CONFIG = {
  BUDGET_MAX_VALUE: 100,                  // Maximum service budget slider value
  UTILITY_FAILURE_GRACE_TICKS: 5,         // Consecutive failed utility ticks tolerated before a building goes offline
  MIN_STAFFING_BASELINE: 2,               // Minimum staff for population-scaled services
  DEFAULT_SERVICE_RADIUS: 10,             // Fallback radius when a service tier omits one
  MIN_EFFECTIVE_SERVICE_RADIUS: 1,         // Smallest non-zero radius for staffed coverage
  COVERAGE_MIN_FACTOR: 0.3,               // Coverage factor at zero effective staffing
  COVERAGE_MAX_FACTOR: 0.7,               // Additional coverage factor at full staffing
  UTILITY_DEMAND_COST_MULTIPLIER: 0.15,   // Running-cost increase per utility demand unit
  FOREST_DESIRABILITY_BONUS: 1,           // Residential growth bonus near forest
  POLICE_DESIRABILITY_BONUS: 1,           // Residential growth bonus for police coverage
  FIRE_DESIRABILITY_BONUS: 1,             // Residential growth bonus for fire coverage
  HOSPITAL_DESIRABILITY_BONUS: 1,         // Residential growth bonus for hospital coverage
  SCHOOL_DESIRABILITY_BONUS: 1,           // Residential growth bonus for school coverage
  LIBRARY_DESIRABILITY_BONUS: 1,          // Residential growth bonus for library coverage
  CITY_HALL_DESIRABILITY_BONUS: 2,        // Residential growth bonus for city hall coverage
};

// Procedural map-generation balance controls. Adjust these to change map character.
export const TERRAIN_GENERATION_CONFIG = {
  RANDOM_SEED_MAX: 9000000,               // Upper bound for generated map seeds
  RANDOM_SEED_MIN: 100000,                // Lower bound for generated map seeds
  MAP_SCALE_BASE_AREA: 900,               // Map area represented by one terrain-generation scale unit
  FOREST_CLUSTER_COUNT_SCALE: 6,          // Forest clusters per map-scale unit
  FOREST_CLUSTER_CENTER_MARGIN: 4,        // Margin used when choosing forest cluster centers
  FOREST_CLUSTER_RADIUS_BASE: 3,          // Minimum forest cluster radius
  FOREST_CLUSTER_RADIUS_RANDOM: 5,        // Random forest radius range
  FOREST_CLUSTER_RADIUS_WOBBLE_RANGE: 0.8, // Forest edge wobble range
  FOREST_CLUSTER_RADIUS_WOBBLE_CENTER: 0.4, // Forest edge wobble midpoint
  ROCK_CLUSTER_COUNT_SCALE: 4,            // Rock clusters per map-scale unit
  ROCK_CLUSTER_CENTER_MARGIN: 4,          // Margin used when choosing rock cluster centers
  ROCK_CLUSTER_RADIUS_BASE: 2,            // Minimum rock cluster radius
  ROCK_CLUSTER_RADIUS_RANDOM: 4,          // Random rock radius range
  ROCK_CLUSTER_RADIUS_WOBBLE_RANGE: 0.6,  // Rock edge wobble range
  ROCK_CLUSTER_RADIUS_WOBBLE_CENTER: 0.3, // Rock edge wobble midpoint
  LAKE_COUNT_RANDOM_RANGE: 6,             // Random lake count range, producing 0 through 5 lakes
  LAKE_RADIUS_MIN: 2,                     // Minimum lake radius
  LAKE_RADIUS_RANDOM_RANGE: 6,            // Random lake radius range
  LAKE_MARGIN_BUFFER: 2,                  // Extra lake placement margin around its radius
  LAKE_RADIUS_WOBBLE_RANGE: 0.8,           // Lake edge wobble range
  LAKE_RADIUS_WOBBLE_CENTER: 0.4,          // Lake edge wobble midpoint
  RIVER_SIMPLE_PROBABILITY: 0.4,           // Probability of a single uninterrupted river
  RIVER_FORK_PROBABILITY: 0.3,             // Probability of a river fork
  RIVER_MARGIN_SCALE: 0.25,               // Interior junction margin as a map fraction
  RIVER_MARGIN_ABSOLUTE: 5,               // Minimum interior junction margin
  RIVER_PATH_MAX_STEPS_MULTIPLIER: 4,     // Path length limit per map dimension
  RIVER_PATH_TOWARD_TARGET_CHANCE: 0.65,  // Chance of moving toward the target
  RIVER_PATH_TIE_BREAK_CHANCE: 0.5,        // Chance of choosing one axis when equally distant
  RIVER_EDGE_POINT_MARGIN_SCALE: 0.1,      // Edge entry margin as a map fraction
  RIVER_EDGE_POINT_MARGIN_ABSOLUTE: 3,     // Minimum edge entry margin
};

// Renderer tuning controls. These affect presentation and frame-time behavior.
export const RENDERER_CONFIG = {
  DEFAULT_ZOOM: 1.0,                       // Initial camera zoom
  ZOOM_MAX: 2.5,                           // Maximum camera zoom
  ZOOM_MIN: 0.4,                           // Minimum camera zoom
  LOW_DETAIL_THRESHOLD: 0.7,               // Zoom below which low-detail rendering is used
  DELTA_TIME_MAX: 0.1,                     // Maximum animation time accumulated per frame
  TERRAIN_BUILD_BUDGET: 1200,              // Terrain-cache tiles built per frame
};




