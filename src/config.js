export const MAP_WIDTH = 150;
export const MAP_HEIGHT = 150;
export const GRID_WIDTH = MAP_WIDTH;
export const GRID_HEIGHT = MAP_HEIGHT;
export const TILE_SIZE = 32;

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

export const PRODUCER_TYPE = {
  POWER_PLANT: 'power_plant',
  WATER_TOWER: 'water_tower',
  SEWAGE_PLANT: 'sewage_plant',
};

export const PRODUCER_CONFIG = {
  [PRODUCER_TYPE.POWER_PLANT]: {
    name: 'Power Plant',
    utility: 'power',
    capacity: 100,
    cost: 500,
    color: '#f39c12',
    requiresWaterAdjacent: false,
  },
  [PRODUCER_TYPE.WATER_TOWER]: {
    name: 'Water Tower',
    utility: 'water',
    capacity: 120,
    cost: 300,
    color: '#3498db',
    requiresWaterAdjacent: true,
  },
  [PRODUCER_TYPE.SEWAGE_PLANT]: {
    name: 'Sewage Plant',
    utility: 'sewage',
    capacity: 120,
    cost: 400,
    color: '#8e44ad',
    requiresWaterAdjacent: true,
  },
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
};

export const COSTS = {
  ROAD: 10,
  ZONE: 20,
  BULLDOZE: 5,
};

export const BASE_INCOME = {
  [ZONE.RESIDENTIAL]: {
    [DENSITY.LIGHT]: 1,
    [DENSITY.MEDIUM]: 2,
    [DENSITY.HIGH]: 3,
  },
  [ZONE.COMMERCIAL]: {
    [DENSITY.LIGHT]: 2,
    [DENSITY.MEDIUM]: 4,
    [DENSITY.HIGH]: 6,
  },
  [ZONE.INDUSTRIAL]: {
    [DENSITY.LIGHT]: 2,
    [DENSITY.MEDIUM]: 4,
    [DENSITY.HIGH]: 6,
  },
};

export const POLLUTION_CONFIG = {
  INDUSTRIAL_RADIUS: { light: 3, medium: 5, high: 7 },
  INDUSTRIAL_EMISSION: { light: 2, medium: 5, high: 10 },

  SEWAGE_BACKUP_RADIUS: 4,
  SEWAGE_BACKUP_EMISSION: 6,

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
  BASE_NEUTRAL_TAX_RATE: 100,
  TAX_PENALTY_PER_50_PCT: 1,
  EMPLOYMENT_BONUS_MAX: 1,
};

export const FOREST_POLLUTION_ABSORPTION = 2;
export const FOREST_DESIRABILITY_RADIUS = 3;




