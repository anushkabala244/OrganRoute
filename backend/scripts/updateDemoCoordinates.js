
require("dotenv").config();

const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const demoLocations = [
    { name: "City Care Hospital", city: "Noida", offset: 0 },
    { name: "Green Life Hospital", city: "Delhi", offset: 0 },
    { name: "Metro Health Hospital", city: "Noida", offset: 1 },
    { name: "Sunrise Medical Centre", city: "Ghaziabad", offset: 0 },
    { name: "Hope Multispeciality Hospital", city: "Delhi", offset: 1 }
];

const offsets = [
    [0, 0],
    [0.005, 0.005]
];

const delay = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

async function getCityCoordinates(city) {
    const params = new URLSearchParams({
        city,
        state: city === "Delhi" ? "Delhi" : "Uttar Pradesh",
        country: "India",
        format: "json",
        limit: "1"
    });

    const response = await fetch(
        `${NOMINATIM_URL}?${params}`,
        {
            headers: {
                "User-Agent": "OrganRoute-MCA-Demo/1.0"
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Geocoding failed for ${city}`);
    }

    const results = await response.json();

    if (!results.length) {
        throw new Error(`No coordinates found for ${city}`);
    }

    return {
        latitude: Number(results[0].lat),
        longitude: Number(results[0].lon)
    };
}

async function updateDemoCoordinates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const cityCoordinates = {};

        for (const city of ["Noida", "Delhi", "Ghaziabad"]) {
            cityCoordinates[city] = await getCityCoordinates(city);
            await delay(1100);
        }

        for (const item of demoLocations) {
            const hospital = await Hospital.findOne({
                name: item.name,
                city: item.city
            });

            if (!hospital) {
                console.log("Hospital not found:", item.name);
                continue;
            }

            const base = cityCoordinates[item.city];
            const offset = offsets[item.offset];

            hospital.latitude = base.latitude + offset[0];
            hospital.longitude = base.longitude + offset[1];

            // Keep hospital approval unchanged.
            await hospital.save();

            console.log(
                "Coordinates updated:",
                hospital.name,
                hospital.latitude,
                hospital.longitude
            );
        }

        console.log("\nDemo coordinates update completed.");

    } catch (error) {
        console.error("Coordinate update failed:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

updateDemoCoordinates();
