const mongoose = require("mongoose");

async function connectDB() {
    const uri = process.env.MONGODB_URI?.trim();

    if (!uri) {
        throw new Error("MONGODB_URI is not set. Add your MongoDB Atlas URI to backend/.env.");
    }

    let parsedUri;
    try {
        parsedUri = new URL(uri);
    } catch {
        throw new Error("MONGODB_URI is invalid. Check the MongoDB Atlas connection string.");
    }

    if (!["mongodb:", "mongodb+srv:"].includes(parsedUri.protocol)) {
        throw new Error("MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme.");
    }

    if (/[<>]/.test(uri) || /YOUR_[A-Z_]+|CHANGE_ME|db_password/i.test(uri)) {
        throw new Error("MONGODB_URI still contains template placeholders. Replace them with your MongoDB Atlas credentials.");
    }

    try {
        await mongoose.connect(uri);
        console.log("MongoDB connected successfully!");
    } catch (error) {
        throw new Error(`MongoDB connection failed: ${error.message}`, { cause: error });
    }
}

module.exports = connectDB;