import { CRIME_CONFIG, splitDemographics, PRODUCER_TYPE, getProducerTier, getServiceTierStat } from '../config.js';
import { CoverageManager } from './CoverageManager.js';

export class CrimeManager {
  static updateCrime(grid, stats) {
    // 1. Serve prisoner sentences before resolving this tick's incidents.
    for (const producer of grid.producers) {
      if (producer.type !== PRODUCER_TYPE.POLICE_STATION) continue;
      const timers = Array.isArray(producer.prisonerTimers) ? producer.prisonerTimers : [];
      producer.prisonerTimers = timers.map((ticks) => ticks - 1).filter((ticks) => ticks > 0);
      producer.prisoners = producer.prisonerTimers.length;
    }

    // 2. The catch-and-release mood hit lasts two ticks, including this one.
    stats.catchAndReleasePenaltyTicks = Math.max(0, (stats.catchAndReleasePenaltyTicks || 0) - 1);

    // 3. Resolve incidents already in progress (four-tick life).
    const resolvedThisTick = new Set();
    for (const tile of grid.getActiveZonedTiles()) {
      if (!(tile.crimeIncidentTicks > 0)) continue;
      this.resolveIncident(grid, tile, stats);
      resolvedThisTick.add(tile);
    }

    const totalWorkforce = stats.totalEmployablePopulation || 0;
    const unemployed = stats.unemployedWorkers || 0;

    // Citywide Unemployment Risk Scaler (0.0 to 1.0)
    const cityUnemploymentRate = totalWorkforce > 0 ? (unemployed / totalWorkforce) : 0;

    for (const tile of grid.getActiveZonedTiles()) {
      const currentCrime = tile.crime || 0;
      const pop = tile.population || 0;
      const jobs = tile.filledJobs || 0;

      // A tile that just ran or resolved an incident waits until the next tick.
      if (tile.crimeIncidentTicks > 0 || resolvedThisTick.has(tile)) continue;

      // Rule 1: No population/occupants = No new crime.
      if (pop === 0 && jobs === 0) {
        this.decayCrime(tile);
        continue;
      }

      // Rule 2: Demographic Filtering — Only working-age population drives potential residential crime.
      // Kids and retirees are excluded from the risk pool.
      const tileWorkforce = pop > 0 ? splitDemographics(pop).workforce : jobs;
      if (tileWorkforce <= 0) {
        this.decayCrime(tile);
        continue;
      }

      // Rule 3: Crime Risk Calculation
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
        tile.crimeDecayTicks = CRIME_CONFIG.CRIME_MEMORY_TICKS;
        tile.crimeIncidentTicks = CRIME_CONFIG.CRIME_INCIDENT_TICKS;
      } else if (currentCrime > 0) {
        this.decayCrime(tile);
      }

      // Rule 4: Crime Diffusion to Adjacent Occupied Tiles
      if (tile.crime >= CRIME_CONFIG.CRIME_DIFFUSION_THRESHOLD) {
        const neighbors = grid.getNeighbors(tile.x, tile.y);
        for (const neighbor of neighbors) {
          if (neighbor.zone && neighbor.zone !== 'none' && (neighbor.population > 0 || neighbor.filledJobs > 0)) {
            neighbor.crime = Math.min(
              CRIME_CONFIG.MAX_CRIME_LEVEL,
              (neighbor.crime || 0) + CRIME_CONFIG.CRIME_DIFFUSION_INCREMENT
            );
            neighbor.crimeDecayTicks = CRIME_CONFIG.CRIME_MEMORY_TICKS;
          }
        }
      }
    }
  }

  /**
   * One response roll for an active crime. The chance depends on how far inside the
   * responding station's coverage the tile sits: close is fast, the edge is slow.
   * A caught crime is removed from the tile (mitigating growth, happiness and tax
   * penalties). A free cell holds the offender for ten ticks; otherwise the offender
   * is released and the city takes a small two-tick mood hit.
   */
  static resolveIncident(grid, tile, stats) {
    const source = CoverageManager.getCoverageSource(grid, 'police', tile.x, tile.y);
    const station = source
      ? grid.producers.find((producer) => producer.id === source.stationId && producer.type === PRODUCER_TYPE.POLICE_STATION)
      : null;

    if (station && station.operational !== false && (station.filledJobs || 0) > 0) {
      const closeness = Math.max(0, Math.min(1, 1 - source.distance / Math.max(1, source.maxDistance)));
      const chance = CRIME_CONFIG.CRIME_RESPONSE_MIN_CHANCE
        + (CRIME_CONFIG.CRIME_RESPONSE_MAX_CHANCE - CRIME_CONFIG.CRIME_RESPONSE_MIN_CHANCE)
        * Math.pow(closeness, CRIME_CONFIG.CRIME_RESPONSE_CURVE);

      if (Math.random() < chance) {
        tile.crime = Math.max(0, (tile.crime || 0) - CRIME_CONFIG.CRIME_INCREMENT_PER_EVENT);
        tile.crimeIncidentTicks = 0;

        const cells = getServiceTierStat('cells', getProducerTier(station));
        if (!Array.isArray(station.prisonerTimers)) station.prisonerTimers = [];
        if (station.prisonerTimers.length < cells) {
          station.prisonerTimers.push(CRIME_CONFIG.PRISONER_HOLD_TICKS);
          station.prisoners = station.prisonerTimers.length;
        } else {
          stats.catchAndReleasePenaltyTicks = CRIME_CONFIG.CATCH_AND_RELEASE_PENALTY_TICKS;
        }
        return;
      }
    }

    tile.crimeIncidentTicks = Math.max(0, tile.crimeIncidentTicks - 1);
  }

  static decayCrime(tile) {
    if (!(tile.crime > 0)) return;
    const remaining = tile.crimeDecayTicks || CRIME_CONFIG.CRIME_MEMORY_TICKS;
    tile.crimeDecayTicks = remaining - 1;
    tile.crime = tile.crimeDecayTicks > 0 ? tile.crime * (tile.crimeDecayTicks / remaining) : 0;
  }
}
