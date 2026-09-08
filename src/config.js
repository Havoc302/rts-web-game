export const MAP_WIDTH = 150;
export const MAP_HEIGHT = 150;
export const GRID_WIDTH = MAP_WIDTH;
export const GRID_HEIGHT = MAP_HEIGHT;
export const TILE_SIZE = 32;
export const MONEY_MULTIPLIER = 10;
export const STARTING_TREASURY = 25000;

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
  WATER_TOWER: 'water_tower',
  SEWAGE_PLANT: 'sewage_plant',
  SURVEY_STATION: 'survey_station',
  ...SERVICE_TYPE,
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
    cost: 4000,
    color: '#3b82f6',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 500, high: 2500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 20, medium: 80, high: 240 },
    runningCostPerJob: 2,
    unique: false,
  },
  [SERVICE_TYPE.FIRE_STATION]: {
    name: 'Fire Department',
    category: 'service',
    cost: 4000,
    color: '#ef4444',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 500, high: 2500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 1, water: 1, sewage: 1 },
    runningCost: { light: 20, medium: 80, high: 240 },
    runningCostPerJob: 2,
    unique: false,
  },
  [SERVICE_TYPE.HOSPITAL]: {
    name: 'Hospital & Ambulance',
    category: 'service',
    cost: 6000,
    color: '#10b981',
    radius: { light: 10, medium: 50, high: 200 },
    jobs: { light: 10, medium: 50, high: 200 },
    popThresholds: { medium: 750, high: 3500 },
    officersPerPopulation: 1000,
    utilityUsage: { power: 2, water: 2, sewage: 2 },
    runningCost: { light: 40, medium: 140, high: 400 },
    runningCostPerJob: 4,
    unique: false,
  },
  [SERVICE_TYPE.SCHOOL]: {
    name: 'School',
    category: 'service',
    cost: 3500,
    color: '#f59e0b',
    radius: { light: 8, medium: 15, high: 25 },
    jobs: { light: 10, medium: 40, high: 150 },
    popThresholds: { medium: 300, high: 1500 },
    runningCost: { light: 20, medium: 70, high: 200 },
    runningCostPerJob: 2,
    unique: false,
  },
  [SERVICE_TYPE.LIBRARY]: {
    name: 'Public Library',
    category: 'service',
    cost: 2500,
    color: '#8b5cf6',
    radius: { light: 8, medium: 14, high: 22 },
    jobs: { light: 5, medium: 20, high: 75 },
    popThresholds: { medium: 200, high: 1000 },
    runningCost: { light: 10, medium: 50, high: 140 },
    runningCostPerJob: 1,
    unique: false,
  },
  [SERVICE_TYPE.CITY_HALL]: {
    name: 'City Hall',
    category: 'civic',
    cost: 10000,
    color: '#eab308',
    radius: { light: 30, medium: 45, high: 60 },
    jobs: { light: 30, medium: 100, high: 300 },
    popThresholds: { medium: 1000, high: 5000 },
    unique: true,
  },
};

export const PRODUCER_CONFIG = {
  [PRODUCER_TYPE.POWER_PLANT]: {
    name: 'Power Plant',
    utility: 'power',
    capacity: 100,
    cost: 5000,
    color: '#f39c12',
    requiresWaterAdjacent: false,
  },
  [PRODUCER_TYPE.WATER_TOWER]: {
    name: 'Water Pump',
    utility: 'water',
    capacity: 120,
    cost: 3000,
    color: '#3498db',
    requiresWaterAdjacent: true,
  },
  [PRODUCER_TYPE.SEWAGE_PLANT]: {
    name: 'Sewage Plant',
    utility: 'sewage',
    capacity: 120,
    cost: 4000,
    color: '#8e44ad',
    requiresWaterAdjacent: true,
  },
  [PRODUCER_TYPE.SURVEY_STATION]: {
    name: 'Survey Station',
    category: 'utility',
    cost: 7500,
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
  ROAD: 100,
  BRIDGE: 500,
  ZONE: 200,
  INDUSTRIAL_ZONE: 300,
  BULLDOZE: 50,
};

export const ROAD_MAINTENANCE_COST = 10;

export const TAX_REVENUE_CONFIG = {
  RESIDENTS_PER_TAX_UNIT: 100,
  EMPLOYED_PER_TAX_UNIT: 100,
  MONEY_PER_TAX_UNIT: 10,
};

export const BASE_INCOME = {
  [ZONE.RESIDENTIAL]: {
    [DENSITY.LIGHT]: 10,
    [DENSITY.MEDIUM]: 20,
    [DENSITY.HIGH]: 30,
  },
  [ZONE.COMMERCIAL]: {
    [DENSITY.LIGHT]: 20,
    [DENSITY.MEDIUM]: 40,
    [DENSITY.HIGH]: 60,
  },
  [ZONE.INDUSTRIAL]: {
    [DENSITY.LIGHT]: 30,
    [DENSITY.MEDIUM]: 60,
    [DENSITY.HIGH]: 90,
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
  [DENSITY.LIGHT]: 50,
  [DENSITY.MEDIUM]: 250,
  [DENSITY.HIGH]: 1000,
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

export const FOREST_POLLUTION_ABSORPTION = 2;
export const FOREST_DESIRABILITY_RADIUS = 3;




