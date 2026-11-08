
/**
 * OrganRoute Hospital Graph
 * Nodes = Hospitals
 * Directed edges = Road connections
 * Weights = Road distance in meters
 */

function createHospitalGraph(hospitals, connections) {
    const graph = new Map();

    for (const hospital of hospitals) {
        graph.set(hospital._id.toString(), new Map());
    }

    for (const connection of connections) {
        const { from, to, distanceMeters } = connection;

        if (
            !graph.has(from) ||
            !graph.has(to) ||
            !Number.isFinite(distanceMeters) ||
            distanceMeters < 0
        ) {
            throw new Error("Invalid hospital graph connection.");
        }

        graph.get(from).set(to, distanceMeters);
    }

    return graph;
}

module.exports = createHospitalGraph;
