
const source = {
    name: "City Care Hospital",
    latitude: 28.5706333,
    longitude: 77.3272147
};

const destination = {
    name: "Green Life Hospital",
    latitude: 28.6664535,
    longitude: 77.2169781
};

async function testOSRM() {
    try {
        const url =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${source.longitude},${source.latitude};` +
            `${destination.longitude},${destination.latitude}` +
            `?overview=full&geometries=geojson`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`OSRM HTTP error: ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== "Ok") {
            throw new Error(data.message || "Route not found");
        }

        const route = data.routes[0];

        console.log("\nORGANROUTE OSRM TEST");
        console.log("--------------------");
        console.log("Source:", source.name);
        console.log("Destination:", destination.name);
        console.log("Distance:", (route.distance / 1000).toFixed(2), "km");
        console.log("Travel time:", (route.duration / 60).toFixed(2), "minutes");
        console.log("Road coordinates:", route.geometry.coordinates.length);
        console.log("OSRM status: SUCCESS");

    } catch (error) {
        console.error("OSRM test failed:", error.message);
    }
}

testOSRM();
