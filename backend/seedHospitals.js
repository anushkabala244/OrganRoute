require("dotenv").config();

const connectDB = require("./config/db");
const Hospital = require("./models/Hospital");
const demoHospitals = require("./data/demoHospitals");

async function seedHospitals() {
    try {
        await connectDB();

        const result = await Hospital.bulkWrite(demoHospitals.map(hospital => {
            const insertFields = { ...hospital };
            delete insertFields.isDemo;
            return {
                updateOne: {
                    filter: { contact: hospital.contact },
                    update: {
                        $set: { isDemo: true },
                        $setOnInsert: insertFields
                    },
                    upsert: true
                }
            }
        }));

        console.log(
            `${result.upsertedCount} demo hospitals added; ` +
            `${result.matchedCount} existing demo hospitals preserved.`
        );
    } catch (error) {
        console.error("Error:", error.message);
        process.exitCode = 1;
    } finally {
        await Hospital.db.close();
    }
}

seedHospitals();