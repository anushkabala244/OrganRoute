
require("dotenv").config();

const mongoose = require("mongoose");
const Hospital = require("../models/Hospital");

async function checkCoordinates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const hospitals = await Hospital.find({})
            .select("name city state verified latitude longitude")
            .lean();

        console.log("\nORGANROUTE HOSPITAL COORDINATES\n");

        console.table(
            hospitals.map(h => ({
                name: h.name,
                city: h.city,
                verified: h.verified,
                latitude: h.latitude,
                longitude: h.longitude
            }))
        );

        console.log("Total hospitals:", hospitals.length);

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

checkCoordinates();
