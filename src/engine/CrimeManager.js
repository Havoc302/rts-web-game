import { CRIME_CONFIG, ZONE } from '../config.js';

export class CrimeManager {
  static updateCrime(grid, stats) {
    // 1. Decay existing crime on all tiles
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.tiles[y][x];
        tile.crime = Math.max(0, (tile.crime || 0) - CRIME_CONFIG.CRIME_DISSIPATION_RATE);
      }
    }

    // 2. Compute crime probability from job scarcity (residents who want work
    // but can't find any) rather than the jobs-side employment rate, so a
    // city with abundant jobs stays low-crime even if few of the total
    // openings are filled yet.
    const employablePopulation = stats.totalEmployablePopulation ?? 0;
    const jobScarcity = employablePopulation > 0
      ? Math.max(0, (employablePopulation - (stats.jobsFilled ?? 0)) / employablePopulation)
      : 0;
    const crimeProbability = Math.min(1, CRIME_CONFIG.BASE_CRIME_CHANCE +
      (jobScarcity * CRIME_CONFIG.JOB_SCARCITY_CRIME_SCALER));

    // 3. Gather zoned tiles and select a random sample of targets
    const zonedTiles = [];
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.tiles[y][x];
        if (tile.zone === ZONE.RESIDENTIAL || tile.zone === ZONE.COMMERCIAL || tile.zone === ZONE.INDUSTRIAL) {
          zonedTiles.push(tile);
        }
      }
    }

    const sampleSize = Math.min(zonedTiles.length, CRIME_CONFIG.CRIME_EVENTS_PER_TICK_MAX);
    const targets = this.sampleRandom(zonedTiles, sampleSize, grid.random);

    // 4. Police check on each target
    for (const tile of targets) {
      if (Math.random() >= crimeProbability) continue;

      if (tile.services?.police && Math.random() < CRIME_CONFIG.POLICE_SUPPRESSION_CHANCE) {
        continue;
      }

      tile.crime = Math.min(CRIME_CONFIG.MAX_CRIME_LEVEL, (tile.crime || 0) + CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT);
    }

    // 5. Diffuse crime to adjacent unpoliced zoned tiles
    const diffusions = [];
    for (const tile of zonedTiles) {
      if (tile.crime > CRIME_CONFIG.CRIME_DIFFUSION_THRESHOLD) {
        for (const neighbor of grid.getNeighbors(tile.x, tile.y)) {
          const isZoned = neighbor.zone === ZONE.RESIDENTIAL || neighbor.zone === ZONE.COMMERCIAL || neighbor.zone === ZONE.INDUSTRIAL;
          if (isZoned && !neighbor.services?.police) {
            diffusions.push(neighbor);
          }
        }
      }
    }
    for (const tile of diffusions) {
      tile.crime = Math.min(CRIME_CONFIG.MAX_CRIME_LEVEL, (tile.crime || 0) + CRIME_CONFIG.CRIME_DIFFUSION_INCREMENT);
    }
  }

  static sampleRandom(items, count, rng = Math.random) {
    const pool = items.slice();
    const result = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }
}
