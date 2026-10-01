export class RoadNetwork {
  static distanceCache = new WeakMap();

  static computeProducerDistances(grid, producerType) {
    const types = Array.isArray(producerType) ? producerType : [producerType];
    const producersOfChoice = grid.producers.filter((p) => types.includes(p.type));

    if (producersOfChoice.length === 0) {
      return { roadDistancesMap: new Map(), connectedZonedTiles: [] };
    }

    const key = `${types.join(',')}:${grid.coverageVersion}:${producersOfChoice.map((prod) =>
      `${prod.id}:${prod.gridConnectionX ?? prod.x},${prod.gridConnectionY ?? prod.y}`
    ).join(';')}`;
    let cache = this.distanceCache.get(grid);
    if (!cache || cache.version !== grid.coverageVersion || cache.tiles !== grid.tiles) {
      cache = { version: grid.coverageVersion, tiles: grid.tiles, distances: new Map() };
      this.distanceCache.set(grid, cache);
    }
    let roadDistancesMap = cache.distances.get(key);
    if (!roadDistancesMap) {
      roadDistancesMap = this.computeRoadDistances(grid, producersOfChoice);
      cache.distances.set(key, roadDistancesMap);
    }

    const connectedZonedTiles = [];

    for (const tile of grid.getActiveZonedTiles()) {

        const neighbors = grid.getNeighbors(tile.x, tile.y);
        const producerMapForTile = new Map(); // producerId -> { distance, producer }

        for (const n of neighbors) {
          if (n.hasRoad) {
            const roadKey = `${n.x},${n.y}`;
            if (roadDistancesMap.has(roadKey)) {
              const prodEntries = roadDistancesMap.get(roadKey);
              for (const [prodId, info] of prodEntries) {
                if (!producerMapForTile.has(prodId) || info.distance < producerMapForTile.get(prodId).distance) {
                  producerMapForTile.set(prodId, info);
                }
              }
            }
          }
        }

        if (producerMapForTile.size > 0) {
          const sortedCandidates = Array.from(producerMapForTile.values()).sort((a, b) => a.distance - b.distance);
          const minDistance = sortedCandidates[0].distance;
          const candidateProducers = sortedCandidates.map((candidate) => candidate.producer);

          connectedZonedTiles.push({
            tile,
            distance: minDistance,
            candidateProducers,
            allCandidatesSorted: sortedCandidates,
          });
        }
    }

    return { roadDistancesMap, connectedZonedTiles };
  }

  static computeRoadDistances(grid, producersOfChoice) {
    // Map: roadKey -> Map(producerId -> { distance, producer })
    const roadDistancesMap = new Map();

    for (const prod of producersOfChoice) {
      const connectionX = prod.gridConnectionX ?? prod.x;
      const connectionY = prod.gridConnectionY ?? prod.y;
      const prodTile = grid.getTile(connectionX, connectionY);
      if (!prodTile) continue;

      const queue = [];
      const visitedForProd = new Set();

      const adjNeighbors = grid.getNeighbors(connectionX, connectionY);
      for (const n of adjNeighbors) {
        if (n.hasRoad) {
          const key = `${n.x},${n.y}`;
          visitedForProd.add(key);

          if (!roadDistancesMap.has(key)) {
            roadDistancesMap.set(key, new Map());
          }
          roadDistancesMap.get(key).set(prod.id, { distance: 1, producer: prod });

          queue.push({ tile: n, distance: 1 });
        }
      }

      while (queue.length > 0) {
        const { tile, distance } = queue.shift();

        const neighbors = grid.getNeighbors(tile.x, tile.y);
        for (const n of neighbors) {
          if (n.hasRoad) {
            const key = `${n.x},${n.y}`;
            if (!visitedForProd.has(key)) {
              visitedForProd.add(key);

              if (!roadDistancesMap.has(key)) {
                roadDistancesMap.set(key, new Map());
              }
              roadDistancesMap.get(key).set(prod.id, { distance: distance + 1, producer: prod });

              queue.push({ tile: n, distance: distance + 1 });
            }
          }
        }
      }
    }

    return roadDistancesMap;
  }
}
