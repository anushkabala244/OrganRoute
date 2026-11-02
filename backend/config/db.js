
const mongoose = require("mongoose");

async function connectDB() {
    const uri = process.env.MONGODB_URI?.trim();

    if (!uri) {
        throw new Error("MONGODB_URI is missing from backend/.env");
    }

    if (
        /[<>]/.test(uri) ||
        /YOUR_[A-Z_]+|CHANGE_ME|db_password/i.test(uri)
    ) {
        throw new Error("Your MongoDB URI still contains a placeholder.");
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
            family: 4
        });

        console.log("MongoDB connected successfully!");
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        throw error;
    }
}

module.exports = connectDB;
