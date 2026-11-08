
const dijkstra = require("../services/dijkstra");

const graph = new Map([
    ["A", new Map([["B", 12], ["D", 7]])],
    ["B", new Map([["A", 12], ["C", 8]])],
    ["C", new Map([["B", 8], ["D", 9]])],
    ["D", new Map([["A", 7], ["C", 9]])]
]);

const result = dijkstra(graph, "A", "C");

console.log("OrganRoute Routing Test");
console.log("Path:", result.path.join(" -> "));
console.log("Road distance:", result.totalDistanceMeters, "meters");
