const express = require("express");

const router = express.Router();
const chatbotUrl = process.env.CHATBOT_SERVICE_URL || "http://127.0.0.1:8000/chat";

router.post("/", async (req, res) => {
    const message = req.body?.message;

    if (typeof message !== "string" || !message.trim() || message.length > 1000) {
        return res.status(400).json({
            success: false,
            message: "Enter a question of up to 1,000 characters."
        });
    }

    try {
        const upstream = await fetch(chatbotUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message.trim() }),
            signal: AbortSignal.timeout(10000)
        });
        const data = await upstream.json();

        if (!upstream.ok) {
            return res.status(upstream.status).json({
                success: false,
                message: data.detail || "The assistant could not answer right now."
            });
        }

        return res.json(data);
    } catch (error) {
        console.error("Chatbot service request failed:", error.message);
        return res.status(503).json({
            success: false,
            message: "The OrganRoute assistant is unavailable. Please try again later."
        });
    }
});

module.exports = router;
