const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");

const router = express.Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5
});

function hashOtp(otp) {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

function createOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

function emailTransporter() {
    return nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD
        }
    });
}

function twilioVerifyService() {
    const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    return client.verify.v2.services(
        process.env.TWILIO_VERIFY_SERVICE_SID
    );
}

// Register user and send real email/SMS OTP
router.post("/register", limiter, async (req, res) => {
    let user;

    try {
        const { name, email, phone, password } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone.trim();

        if (
            !cleanName ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
            !/^\+[1-9]\d{7,14}$/.test(cleanPhone) ||
            password.length < 8 ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter valid details. Phone must include country code, e.g. +919876543210."
            });
        }

        const existing = await User.findOne({
            $or: [
                { email: cleanEmail },
                { phone: cleanPhone }
            ]
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Email or phone is already registered."
            });
        }

        const otp = createOtp();

        user = await User.create({
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            password: await bcrypt.hash(password, 12),
            emailOtpHash: hashOtp(otp),
            emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000)
        });

        await emailTransporter().sendMail({
            from: process.env.EMAIL_USER,
            to: cleanEmail,
            subject: "OrganRoute Email Verification",
            text: `Your verification code is ${otp}. It expires in 10 minutes.`
        });

        await twilioVerifyService().verifications.create({
            to: cleanPhone,
            channel: "sms"
        });

        return res.status(201).json({
            success: true,
            message: "Email and SMS OTP sent."
        });
    } catch (error) {
        console.error("Registration error:", error.message);

        if (user) {
            await User.deleteOne({ _id: user._id }).catch(() => {});
        }

        return res.status(500).json({
            success: false,
            message: "Registration or OTP delivery failed. Check provider configuration."
        });
    }
});

// Verify email OTP
router.post("/verify-email", limiter, async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (
            typeof email !== "string" ||
            typeof otp !== "string" ||
            !/^\d{6}$/.test(otp)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter email and 6-digit OTP."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.emailVerified) {
            return res.json({
                success: true,
                message: "Email already verified."
            });
        }

        if (
            !user.emailOtpHash ||
            !user.emailOtpExpiry ||
            user.emailOtpExpiry.getTime() < Date.now() ||
            hashOtp(otp) !== user.emailOtpHash
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP."
            });
        }

        user.emailVerified = true;
        user.emailOtpHash = null;
        user.emailOtpExpiry = null;

        await user.save();

        return res.json({
            success: true,
            message: "Email verified successfully."
        });
    } catch (error) {
        console.error("Email verification error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Email verification failed."
        });
    }
});

// Verify SMS OTP
router.post("/verify-phone", limiter, async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (
            typeof phone !== "string" ||
            typeof otp !== "string" ||
            !/^\d{4,10}$/.test(otp)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter phone number and SMS OTP."
            });
        }

        const cleanPhone = phone.trim();

        const user = await User.findOne({
            phone: cleanPhone
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.phoneVerified) {
            return res.json({
                success: true,
                message: "Phone already verified."
            });
        }

        const result = await twilioVerifyService()
            .verificationChecks.create({
                to: cleanPhone,
                code: otp
            });

        if (result.status !== "approved") {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired SMS OTP."
            });
        }

        user.phoneVerified = true;
        await user.save();

        return res.json({
            success: true,
            message: "Phone verified successfully."
        });
    } catch (error) {
        console.error("SMS verification error:", error.message);

        return res.status(400).json({
            success: false,
            message: "SMS verification failed."
        });
    }
});

// Login only after both verifications
router.post("/login", limiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!user.emailVerified || !user.phoneVerified) {
            return res.status(403).json({
                success: false,
                message: "Verify email and phone before login."
            });
        }

        return res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

module.exports = router;