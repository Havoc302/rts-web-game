import { CRIME_CONFIG, splitDemographics } from '../config.js';

export class CrimeManager {
  static updateCrime(grid, stats) {
    const totalWorkforce = stats.totalEmployablePopulation || 0;
    const unemployed = stats.unemployedWorkers || 0;

    // 1. Citywide Unemployment Risk Scaler (0.0 to 1.0)
    const cityUnemploymentRate = totalWorkforce > 0 ? (unemployed / totalWorkforce) : 0;

    for (const tile of grid.getActiveZonedTiles()) {
      const currentCrime = tile.crime || 0;
      const pop = tile.population || 0;
      const jobs = tile.filledJobs || 0;

      // Rule 1: No population/occupants = No crime. Dissipate existing crime on vacant tiles.
      if (pop === 0 && jobs === 0) {
        if (currentCrime > 0) {
          tile.crime = Math.max(0, currentCrime - CRIME_CONFIG.CRIME_DISSIPATION_RATE * 2);
        }
        continue;
      }

      // Rule 2: Demographic Filtering — Only working-age population drives potential residential crime.
      // Kids and retirees are excluded from the risk pool.
      const tileWorkforce = pop > 0 ? splitDemographics(pop).workforce : jobs;
      if (tileWorkforce <= 0) {
        if (currentCrime > 0) {
          tile.crime = Math.max(0, currentCrime - CRIME_CONFIG.CRIME_DISSIPATION_RATE);
        }
        continue;
      }

      // Rule 3: Police Suppression Check
      const hasPoliceCoverage = Boolean(tile.services?.police);
      const suppressionChance = hasPoliceCoverage ? CRIME_CONFIG.POLICE_SUPPRESSION_CHANCE : 0;

      if (Math.random() < suppressionChance) {
        // Police presence actively reduces existing crime levels
        if (currentCrime > 0) {
          tile.crime = Math.max(0, currentCrime - CRIME_CONFIG.CRIME_DISSIPATION_RATE);
        }
        continue;
      }

      // Rule 4: Crime Risk Calculation
      // Base risk scales off workforce density on the tile, multiplied by citywide unemployment pressure.
      const workforceDensity = tileWorkforce / (tile.maxPopulation || 100);
      const crimeProbability = CRIME_CONFIG.BASE_CRIME_CHANCE *
                               workforceDensity *
                               (1 + cityUnemploymentRate * CRIME_CONFIG.JOB_SCARCITY_CRIME_SCALER);

      if (Math.random() < crimeProbability) {
        tile.crime = Math.min(
          CRIME_CONFIG.MAX_CRIME_LEVEL,
          currentCrime + CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT
        );
      } else if (currentCrime > 0) {
        // Natural decay when no crime event triggers
        tile.crime = Math.max(0, currentCrime - CRIME_CONFIG.CRIME_DISSIPATION_RATE);
      }

      // Rule 5: Crime Diffusion to Adjacent Occupied Tiles
      if (tile.crime >= CRIME_CONFIG.CRIME_DIFFUSION_THRESHOLD) {
        const neighbors = grid.getNeighbors(tile.x, tile.y);
        for (const neighbor of neighbors) {
          if (neighbor.zone && neighbor.zone !== 'none' && (neighbor.population > 0 || neighbor.filledJobs > 0)) {
            neighbor.crime = Math.min(
              CRIME_CONFIG.MAX_CRIME_LEVEL,
              (neighbor.crime || 0) + CRIME_CONFIG.CRIME_DIFFUSION_INCREMENT
            );
          }
        }
      }
    }
  }
}
