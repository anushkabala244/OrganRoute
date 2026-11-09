const Hospital = require("../models/Hospital");
const dijkstra = require("./dijkstra");
const createHospitalGraph = require("./graphService");

const OSRM_BASE_URL = "https://router.project-osrm.org";

async function getOSRMData(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`OSRM request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== "Ok") {
        throw new Error(data.message || "OSRM could not find a route.");
    }

    return data;
}

async function getRoutingHospitals() {
    return Hospital.find({
        $or: [
            { verified: true },
            { isDemo: true }
        ],
        latitude: { $type: "number" },
        longitude: { $type: "number" }
    }).select("_id name city state latitude longitude verified isDemo");
}

function createInstruction(step) {
    const type = step.maneuver?.type || "continue";
    const modifier = step.maneuver?.modifier || "";
    const roadName = step.name || "the road";
    const distance = step.distance || 0;

    const distanceText = distance >= 1000
        ? `${(distance / 1000).toFixed(1)} km`
        : `${Math.round(distance)} m`;

    const instructions = {
        turn: `Turn ${modifier} onto ${roadName}`,
        "new name": `Continue onto ${roadName}`,
        depart: `Start on ${roadName}`,
        arrive: "You have reached your destination",
        merge: `Merge ${modifier} onto ${roadName}`,
        "on ramp": `Take the ramp ${modifier}`,
        "off ramp": `Take the exit ${modifier}`,
        fork: `Keep ${modifier} at the fork`,
        "end of road": `Turn ${modifier} at the end of the road`,
        continue: `Continue on ${roadName}`,
        roundabout: `Enter the roundabout`,
        rotary: `Enter the rotary`,
        "roundabout turn": `Take the exit at the roundabout`
    };

    return {
        instruction: instructions[type] || `Continue on ${roadName}`,
        roadName,
        distanceMeters: Math.round(distance),
        distanceText,
        maneuverType: type,
        modifier
    };
}

function formatRoute(route, index) {
    const steps = [];

    for (const leg of route.legs || []) {
        for (const step of leg.steps || []) {
            const formatted = createInstruction(step);

            if (formatted.distanceMeters > 0 || formatted.maneuverType === "arrive") {
                steps.push(formatted);
            }
        }
    }

    return {
        id: `route-${index + 1}`,
        name: `Route ${index + 1}`,
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        distanceMeters: Math.round(route.distance),
        durationMinutes: Math.round(route.duration / 60),
        durationSeconds: Math.round(route.duration),
        geometry: route.geometry,
        steps
    };
}

function selectShortestRoute(routeOptions) {
    const source = "route-source";
    const destination = "route-destination";
    const graph = new Map([
        [source, new Map()],
        [destination, new Map()]
    ]);

    routeOptions.forEach(route => {
        const routeNode = `route-option:${route.id}`;
        graph.get(source).set(routeNode, route.distanceMeters);
        graph.set(routeNode, new Map([[destination, 0]]));
    });

    const result = dijkstra(graph, source, destination);
    if (!result.success || !result.path || result.path.length !== 3) {
        throw new Error("Unable to select the shortest available road route.");
    }

    const selected = routeOptions.find(
        route => `route-option:${route.id}` === result.path[1]
    );
    if (!selected) {
        throw new Error("The shortest road route could not be matched to an option.");
    }

    return selected;
}

async function calculateHospitalRoute(sourceHospitalId, recipientHospitalId) {
    const hospitals = await getRoutingHospitals();

    if (hospitals.length < 2) {
        throw new Error("At least two eligible hospitals with coordinates are required.");
    }

    if (hospitals.length > 20) {
        throw new Error("Routing is limited to 20 hospitals in this demo.");
    }

    const source = hospitals.find(
        hospital => hospital._id.toString() === sourceHospitalId
    );

    const destination = hospitals.find(
        hospital => hospital._id.toString() === recipientHospitalId
    );

    if (!source || !destination) {
        throw new Error("Source or destination hospital not found in the routing network.");
    }

    if (sourceHospitalId === recipientHospitalId) {
        throw new Error("Source and destination hospitals must be different.");
    }

    // Build the hospital network using OSRM road distances for shortest-path selection.
    // OSRM coordinate order is longitude,latitude.
    const coordinates = hospitals
        .map(hospital => `${hospital.longitude},${hospital.latitude}`)
        .join(";");

    const tableUrl =
        `${OSRM_BASE_URL}/table/v1/driving/${coordinates}` +
        "?annotations=duration,distance";

    const tableData = await getOSRMData(tableUrl);

    const connections = [];

    hospitals.forEach((fromHospital, fromIndex) => {
        hospitals.forEach((toHospital, toIndex) => {
            if (fromIndex === toIndex) return;

            const distance = tableData.distances[fromIndex][toIndex];

            if (distance === null || !Number.isFinite(distance)) return;

            connections.push({
                from: fromHospital._id.toString(),
                to: toHospital._id.toString(),
                distanceMeters: distance
            });
        });
    });

    const graph = createHospitalGraph(hospitals, connections);

    const networkResult = dijkstra(
        graph,
        sourceHospitalId,
        recipientHospitalId
    );

    if (
        !networkResult.success ||
        !networkResult.path ||
        networkResult.path.length < 2
    ) {
        throw new Error("No connecting route found between these hospitals.");
    }

    const hospitalPath = networkResult.path.map(id =>
        hospitals.find(hospital => hospital._id.toString() === id)
    ).filter(Boolean);

    // Get multiple actual road routes between the selected hospitals.
    const routeUrl =
        `${OSRM_BASE_URL}/route/v1/driving/` +
        `${source.longitude},${source.latitude};` +
        `${destination.longitude},${destination.latitude}` +
        "?overview=full&geometries=geojson&steps=true&alternatives=3";

    const routeData = await getOSRMData(routeUrl);

    if (!routeData.routes || routeData.routes.length === 0) {
        throw new Error("No road route could be found.");
    }

    const routeOptions = routeData.routes.map((route, index) =>
        formatRoute(route, index)
    );

    const fastestRoute = routeOptions.reduce((best, current) =>
        current.durationSeconds < best.durationSeconds ? current : best
    );

    const shortestRoute = selectShortestRoute(routeOptions);

    const demoMode = hospitalPath.some(hospital => hospital.isDemo);

    return {
        success: true,
        demoMode,
        warning: demoMode
            ? "Demo route: hospital coordinates are approximate city-level locations, not verified hospital premises."
            : null,

        sourceHospital: {
            id: source._id,
            name: source.name,
            city: source.city,
            latitude: source.latitude,
            longitude: source.longitude
        },

        recipientHospital: {
            id: destination._id,
            name: destination.name,
            city: destination.city,
            latitude: destination.latitude,
            longitude: destination.longitude
        },

        hospitalPath: hospitalPath.map(hospital => ({
            id: hospital._id,
            name: hospital.name,
            city: hospital.city
        })),

        routeOptions,
        fastestRouteId: fastestRoute.id,
        shortestRouteId: shortestRoute.id,

        // Default route and map use the shortest road-distance option.
        defaultRouteId: shortestRoute.id,
        totalTravelTimeMinutes: shortestRoute.durationMinutes,
        totalDistanceKm: shortestRoute.distanceKm,
        map: shortestRoute.geometry
    };
}

module.exports = {
    getRoutingHospitals,
    calculateHospitalRoute,
    selectShortestRoute
};
