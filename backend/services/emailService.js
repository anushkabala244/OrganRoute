const nodemailer = require("nodemailer");

function isConfigured(value) {
    return typeof value === "string" &&
        value.trim() !== "" &&
        !/^(your|replace|change.?me|todo|example|dummy)/i.test(value.trim());
}

function emailConfigured() {
    return isConfigured(process.env.EMAIL_USER) &&
        isConfigured(process.env.EMAIL_APP_PASSWORD);
}

async function sendEmail(message) {
    if (!emailConfigured()) {
        throw new Error("Email delivery is not configured.");
    }

    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER.trim(),
            pass: process.env.EMAIL_APP_PASSWORD.replace(/\s/g, "")
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });

    return transporter.sendMail({
        from: process.env.EMAIL_USER,
        ...message
    });
}

module.exports = { emailConfigured, isConfigured, sendEmail };
