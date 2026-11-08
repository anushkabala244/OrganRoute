
const Hospital = require("../models/Hospital");

const GOOGLE_ROUTES_URL =
    "https://routes.googleapis.com/directions/v2:computeRoutes";

function durationToMinutes(duration) {
    return Math.round(parseFloat(duration.replace("s", "")) / 60);
}

async function getGoogleRoutes(sourceHospitalId, recipientHospitalId) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API_KEY is missing in backend/.env");
    }

    const hospitals = await Hospital.find({
        _id: {
            $in: [sourceHospitalId, recipientHospitalId]
        },
        $or: [
            { verified: true },
            { isDemo: true }
        ],
        latitude: { $type: "number" },
        longitude: { $type: "number" }
    }).select("_id name city latitude longitude isDemo verified");

    const source = hospitals.find(
        hospital => hospital._id.toString() === sourceHospitalId
    );

    const destination = hospitals.find(
        hospital => hospital._id.toString() === recipientHospitalId
    );

    if (!source || !destination) {
        throw new Error("Eligible source or destination hospital not found.");
    }

    if (sourceHospitalId === recipientHospitalId) {
        throw new Error("Source and destination must be different.");
    }

    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: source.latitude,
                    longitude: source.longitude
                }
            }
        },

        destination: {
            location: {
                latLng: {
                    latitude: destination.latitude,
                    longitude: destination.longitude
                }
            }
        },

        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        computeAlternativeRoutes: true,
        languageCode: "en",
        units: "METRIC"
    };

    const response = await fetch(GOOGLE_ROUTES_URL, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
                "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.description,routes.routeLabels"
        },

        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
        const message =
            data.error?.message || "Google Routes API request failed.";

        throw new Error(message);
    }

    if (!data.routes || data.routes.length === 0) {
        throw new Error("Google could not find a driving route.");
    }

    const routes = data.routes.map((route, index) => {
        const trafficMinutes = durationToMinutes(route.duration);
        const normalMinutes = durationToMinutes(
            route.staticDuration || route.duration
        );

        return {
            routeNumber: index + 1,

            description: route.description || `Route ${index + 1}`,

            distanceKm: Number(
                (route.distanceMeters / 1000).toFixed(2)
            ),

            trafficETA: trafficMinutes,

            normalETA: normalMinutes,

            trafficDelayMinutes: Math.max(
                0,
                trafficMinutes - normalMinutes
            ),

            encodedPolyline:
                route.polyline?.encodedPolyline || null,

            routeLabels: route.routeLabels || []
        };
    });

    const fastestRoute = [...routes].sort(
        (a, b) => a.trafficETA - b.trafficETA
    )[0];

    const shortestRoute = [...routes].sort(
        (a, b) => a.distanceKm - b.distanceKm
    )[0];

    return {
        success: true,

        provider: "Google Routes API",

        trafficAware: true,

        demoMode: Boolean(source.isDemo || destination.isDemo),

        warning:
            source.isDemo || destination.isDemo
                ? "Demo route: hospital coordinates are approximate city-level locations, not verified hospital premises."
                : null,

        sourceHospital: {
            id: source._id,
            name: source.name,
            city: source.city
        },

        destinationHospital: {
            id: destination._id,
            name: destination.name,
            city: destination.city
        },

        fastestRoute,
        shortestRoute,
        allRoutes: routes
    };
}

module.exports = getGoogleRoutes;
