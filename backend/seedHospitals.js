require("dotenv").config();

const connectDB = require("./config/db");
const Hospital = require("./models/Hospital");
const demoHospitals = require("./data/demoHospitals");

async function seedHospitals() {
    try {
        await connectDB();

        // Remove previous copies of these demo records only
        await Hospital.deleteMany({
            contact: {
                $in: demoHospitals.map(hospital => hospital.contact)
            }
        });

        const hospitals = await Hospital.insertMany(demoHospitals);

        console.log(`${hospitals.length} demo hospitals added successfully!`);
    } catch (error) {
        console.error("Error:", error.message);
        process.exitCode = 1;
    } finally {
        await Hospital.db.close();
    }
}

seedHospitals();