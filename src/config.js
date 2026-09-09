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
    utilityUsage: { water: 1, sewage: 1 },
  },
  [PRODUCER_TYPE.SOLAR_PANEL]: {
    name: 'Solar Panel',
    utility: 'power',
    capacity: SOLAR_CONFIG.PEAK_CAPACITY,
    cost: 200 * MONEY_MULTIPLIER,
    color: '#fbbf24',
    requiresWaterAdjacent: false,
    utilityUsage: { water: 1, sewage: 1 },
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

export const ROAD_MAINTENANCE_COST = 1 * MONEY_MULTIPLIER;

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
  INDUSTRIAL_RADIUS: { light: 3, medium: 5, high: 7 },
  INDUSTRIAL_EMISSION: { light: 2, medium: 5, high: 10 },

  SEWAGE_BACKUP_RADIUS: 4,
  SEWAGE_BACKUP_EMISSION: 6,

  RIVER_SEWAGE_FALLOFF: 10,

  CONTAMINATED_TOWER_RADIUS: 8,
  CONTAMINATED_TOWER_EMISSION: 15,

  POLLUTION_GROWTH_PENALTY_THRESHOLD: 5,
  POLLUTION_GROWTH_PENALTY: -1,

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
  EMPLOYMENT_BONUS_MAX: 1,
  GROWTH_NEUTRAL_RATE: 40,
  POPULATION_OUTFLOW_START_RATE: 50,
  MAX_TAX_RATE: 100,
  MAX_OUTFLOW_GROWTH_PENALTY: 4,
  MAX_HIGH_TAX_JOBS_REDUCTION: 0.5,
};

export const FOREST_POLLUTION_ABSORPTION = 6;
export const FOREST_DESIRABILITY_RADIUS = 3;

export const CRIME_CONFIG = {
  BASE_CRIME_CHANCE: 0.05,            // Baseline probability of crime spawning per tick
  JOB_SCARCITY_CRIME_SCALER: 2.5,     // Scales crime probability with job scarcity (residents who want work but have none), not raw unemployment
  CRIME_EVENTS_PER_TICK_MAX: 15,      // Max zoned tiles hit per tick
  POLICE_SUPPRESSION_CHANCE: 0.85,    // 85% chance police presence cancels a crime event on a tile
  CRIME_PENALTY_THRESHOLD: 3,         // Crime level triggering growth score penalties
  CRIME_DISSIPATION_RATE: 1,          // Natural crime decay rate per tick
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




