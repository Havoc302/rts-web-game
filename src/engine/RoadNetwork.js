export class RoadNetwork {
  static computeProducerDistances(grid, producerType) {
    const producersOfChoice = grid.producers.filter((p) => p.type === producerType);

    if (producersOfChoice.length === 0) {
      return { roadDistances: new Map(), connectedZonedTiles: [] };
    }

    // Map: roadKey -> Map(producerId -> { distance, producer })
    const roadDistancesMap = new Map();

    for (const prod of producersOfChoice) {
      const prodTile = grid.getTile(prod.x, prod.y);
      if (!prodTile) continue;

      const queue = [];
      const visitedForProd = new Set();

      const adjNeighbors = grid.getNeighbors(prod.x, prod.y);
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

    const connectedZonedTiles = [];

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const tile = grid.getTile(x, y);
        if (!tile || tile.zone === 'none') continue;

        const neighbors = grid.getNeighbors(x, y);
        const producerMapForTile = new Map(); // producerId -> { distance, producer }

        for (const n of neighbors) {
          if (n.hasRoad) {
            const key = `${n.x},${n.y}`;
            if (roadDistancesMap.has(key)) {
              const prodEntries = roadDistancesMap.get(key);
              for (const [pId, info] of prodEntries) {
                if (!producerMapForTile.has(pId) || info.distance < producerMapForTile.get(pId).distance) {
                  producerMapForTile.set(pId, info);
                }
              }
            }
          }
        }

        if (producerMapForTile.size > 0) {
          const sortedCandidates = Array.from(producerMapForTile.values()).sort((a, b) => a.distance - b.distance);
          const minDistance = sortedCandidates[0].distance;
          const candidateProducers = sortedCandidates.map((c) => c.producer);

          connectedZonedTiles.push({
            tile,
            distance: minDistance,
            candidateProducers,
            allCandidatesSorted: sortedCandidates,
          });
        }
      }
    }

    return { roadDistancesMap, connectedZonedTiles };
  }
}
