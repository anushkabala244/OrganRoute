const assert = require("node:assert/strict");
const { test } = require("node:test");
const createHospitalGraph = require("../services/graphService");
const dijkstra = require("../services/dijkstra");

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
