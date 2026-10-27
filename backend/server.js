require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Welcome to OrganRoute Backend!",
        status: "Server is running"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "OrganRoute API is working"
    });
});

async function startServer() {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`OrganRoute backend running at http://localhost:${PORT}`);
    });
}

startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});