
require("dotenv").config();

const express = require("express");
const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// Serve OrganRoute frontend files from the main project folder
app.use(express.static(path.join(__dirname, "..")));

// API health check
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "OrganRoute API is working",
        database: "Connected"
    });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Start server after database connection
async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log("--------------------------------");
            console.log("OrganRoute is running!");
            console.log(`Website: http://localhost:${PORT}`);
            console.log(`API: http://localhost:${PORT}/api/health`);
            console.log("--------------------------------");
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
