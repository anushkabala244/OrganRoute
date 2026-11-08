require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Hospital = require("../models/Hospital");

const demoHospitalNames = [
    "City Care Hospital",
    "Green Life Hospital",
    "Metro Health Hospital",
    "Sunrise Medical Centre",
    "Hope Multispeciality Hospital"
];

async function markDemoHospitals() {
    try {
        await connectDB();

        const result = await Hospital.updateMany(
            {
                name: { $in: demoHospitalNames },
                userId: null
            },
            {
                $set: { isDemo: true }
            }
        );

        console.log("Matched:", result.matchedCount);
        console.log("Updated:", result.modifiedCount);

        const hospitals = await Hospital.find({
            name: { $in: demoHospitalNames },
            userId: null
        }).select("name city verified isDemo");

        hospitals.forEach(hospital => {
            console.log(hospital);
        });

    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

markDemoHospitals();