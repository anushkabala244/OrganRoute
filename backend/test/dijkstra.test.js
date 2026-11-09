const assert = require("node:assert/strict");
const { test } = require("node:test");
const createHospitalGraph = require("../services/graphService");
const dijkstra = require("../services/dijkstra");
const { selectShortestRoute } = require("../services/routingService");

test("chooses the shortest road-distance path even when another route is faster", () => {
    const hospitals = ["A", "B", "C", "D"].map(_id => ({ _id }));
    const graph = createHospitalGraph(hospitals, [
        { from: "A", to: "B", distanceMeters: 5000 },
        { from: "B", to: "D", distanceMeters: 5000 },
        { from: "A", to: "C", distanceMeters: 7000 },
        { from: "C", to: "D", distanceMeters: 7000 }
    ]);

    const result = dijkstra(graph, "A", "D");

    assert.deepEqual(result.path, ["A", "B", "D"]);
    assert.equal(result.totalDistanceMeters, 10000);
});

test("rejects invalid hospital-road distances", () => {
    const hospitals = [{ _id: "A" }, { _id: "B" }];
    assert.throws(() => createHospitalGraph(hospitals, [
        { from: "A", to: "B", distanceMeters: -1 }
    ]), /Invalid hospital graph connection/);
});

test("Dijkstra selects the shortest OSRM alternative by distance, not time", () => {
    const selected = selectShortestRoute([
        { id: "route-1", distanceMeters: 12000, durationSeconds: 600 },
        { id: "route-2", distanceMeters: 9000, durationSeconds: 900 },
        { id: "route-3", distanceMeters: 10000, durationSeconds: 500 }
    ]);

    assert.equal(selected.id, "route-2");
});
