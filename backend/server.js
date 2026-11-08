require("dotenv").config();

const express = require("express");
const path = require("path");

const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const protectedRoutes = require("./routes/protected");
const adminRoutes = require("./routes/admin");
const routingRoutes = require("./routes/routing");
const chatRoutes = require("./routes/chat");
const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api/routing", routingRoutes);
app.use("/api/chat", chatRoutes);

app.get("/internal/platform-admin", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.redirect(302, "/index.html?internal=platform-admin");
});
app.get("/internal/driver", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.redirect(302, "/index.html?internal=driver");
});

// Frontend files
app.use(express.static(path.join(__dirname, "..")));

// API health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "OrganRoute API is running",
        database: "Connected"
    });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

// Protected routes
app.use("/api", protectedRoutes);

// API 404 handler
app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            success: false,
            message: "API endpoint not found"
        });
    }

    next();
});

// Start server
async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log("================================");
            console.log("OrganRoute started successfully!");
            console.log(`Website: http://localhost:${PORT}`);
            console.log(`API: http://localhost:${PORT}/api/health`);
            console.log(`Admin API: http://localhost:${PORT}/api/admin`);
            console.log("================================");
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();