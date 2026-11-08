
function dijkstra(graph, start, destination) {
    if (!graph.has(start) || !graph.has(destination)) {
        throw new Error("Source or destination hospital not found.");
    }

    const distances = new Map();
    const previous = new Map();
    const unvisited = new Set(graph.keys());

    for (const hospital of graph.keys()) {
        distances.set(hospital, Infinity);
        previous.set(hospital, null);
    }

    distances.set(start, 0);

    while (unvisited.size > 0) {
        let current = null;
        let smallestDistance = Infinity;

        for (const hospital of unvisited) {
            if (distances.get(hospital) < smallestDistance) {
                smallestDistance = distances.get(hospital);
                current = hospital;
            }
        }

        if (current === null) break;
        if (current === destination) break;

        unvisited.delete(current);

        for (const [neighbour, distanceMeters] of graph.get(current)) {
            if (!unvisited.has(neighbour)) continue;

            if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
                throw new Error("Invalid edge weight.");
            }

            const newDistance = distances.get(current) + distanceMeters;

            if (newDistance < distances.get(neighbour)) {
                distances.set(neighbour, newDistance);
                previous.set(neighbour, current);
            }
        }
    }

    if (!Number.isFinite(distances.get(destination))) {
        return {
            success: false,
            message: "No route found."
        };
    }

    const path = [];
    let current = destination;

    while (current !== null) {
        path.unshift(current);
        current = previous.get(current);
    }

    return {
        success: true,
        path,
        totalDistanceMeters: distances.get(destination)
    };
}

module.exports = dijkstra;
