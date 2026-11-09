
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const rateLimit = require("express-rate-limit");

const User = require("../models/User");
const Hospital = require("../models/Hospital");
const { isConfigured, sendEmail } = require("../services/emailService");
const geocodingService = require("../services/geocodingService");

const router = express.Router();

function createLimiter(limit, message) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({
            success: false,
            message
        })
    });
}

const registrationLimiter = createLimiter(
    10,
    "Too many account creation attempts. Please wait 15 minutes before trying again."
);
const loginLimiter = createLimiter(
    10,
    "Too many sign-in attempts. Please wait 15 minutes before trying again."
);
const emailVerificationLimiter = createLimiter(
    5,
    "Too many email verification attempts. Please wait 15 minutes before trying again."
);
const phoneVerificationLimiter = createLimiter(
    5,
    "Too many SMS verification attempts. Please wait 15 minutes before trying again."
);
const passwordResetLimiter = createLimiter(
    5,
    "Too many password recovery attempts. Please wait 15 minutes before trying again."
);

function hashOtp(otp) {
    return crypto.createHash("sha256").update(otp).digest("hex");
}

function createOtp() {
    return crypto.randomInt(100000, 1000000).toString();
}

function developmentOtpMode() {
    return process.env.NODE_ENV === "development" &&
        process.env.DEV_OTP_MODE === "true";
}

function developmentPasswordResetMode() {
    return process.env.NODE_ENV === "development" &&
        process.env.DEV_PASSWORD_RESET_MODE === "true";
}

function otpProviderConfigured(method) {
    const requiredSettings = method === "email"
        ? [process.env.EMAIL_USER, process.env.EMAIL_APP_PASSWORD]
        : [
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN,
            process.env.TWILIO_VERIFY_SERVICE_SID
        ];
    return requiredSettings.every(isConfigured);
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

function createToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing from .env");
    }

    return jwt.sign(
        {
            sub: user._id.toString(),
            role: user.role,
            ver: user.authVersion || 0
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
}

// Public registration is restricted to patients and hospitals.
router.post("/register", registrationLimiter, async (req, res) => {
    let user;
    let geocodedCoordinates = null;
    let geocodingWarning = "";

    try {
        const {
            name, email, phone, password, role,
            hospitalName, address, country, city, state, postalCode,
            speciality, registrationNumber,
            verificationMethod
        } = req.body;

        const accountRole = role || "patient";

        if (!["patient", "hospital"].includes(accountRole)) {
            return res.status(400).json({
                success: false,
                message: "Public registration is available for patient and hospital accounts only."
            });
        }

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string" ||
            typeof password !== "string" ||
            !["email", "phone"].includes(verificationMethod)
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email, phone, password and a valid verification method are required."
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

        if (
            accountRole === "hospital" &&
            (
                typeof hospitalName !== "string" ||
                !hospitalName.trim() ||
                typeof city !== "string" ||
                !city.trim() ||
                typeof state !== "string" ||
                !state.trim() ||
                typeof address !== "string" ||
                !address.trim() ||
                address.trim().length > 240 ||
                typeof country !== "string" ||
                !country.trim() ||
                country.trim().length > 100 ||
                typeof registrationNumber !== "string" ||
                !registrationNumber.trim() ||
                registrationNumber.trim().length > 80 ||
                typeof postalCode !== "string" ||
                !postalCode.trim() ||
                postalCode.trim().length > 20
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Hospital name, address, country, registration number, city, state and PIN code are required."
            });
        }

        if (!developmentOtpMode() && !otpProviderConfigured(verificationMethod)) {
            return res.status(503).json({
                success: false,
                message: verificationMethod === "email"
                    ? "Email verification is not configured. Configure EMAIL_USER and EMAIL_APP_PASSWORD, or enable DEV_OTP_MODE for local development."
                    : "SMS verification is not configured. Configure the Twilio settings, or enable DEV_OTP_MODE for local development."
            });
        }

        const existing = await User.findOne({
            $or: [{ email: cleanEmail }, { phone: cleanPhone }]
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Email or phone is already registered."
            });
        }

        if (accountRole === "hospital") {
            try {
                geocodedCoordinates = await geocodingService.geocodeAddress({
                    address,
                    city,
                    state,
                    postalCode,
                    country
                });
                if (!geocodedCoordinates) {
                    geocodingWarning =
                        "The address could not be located automatically. Routing will remain unavailable until the hospital location is resolved.";
                }
            } catch (error) {
                console.error("Hospital address geocoding failed:", error.message);
                geocodingWarning =
                    "Automatic location lookup is temporarily unavailable. Routing will remain unavailable until the hospital location is resolved.";
            }
        }

        const otp = createOtp();

        user = await User.create({
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            password: await bcrypt.hash(password, 12),
            role: accountRole,
            hospitalName: accountRole === "hospital"
                ? hospitalName.trim()
                : "",
            approved: accountRole === "patient",
            verificationMethod,
            ...(verificationMethod === "email"
                ? {
                    emailOtpHash: hashOtp(otp),
                    emailOtpExpiry: new Date(Date.now() + 10 * 60 * 1000)
                }
                : developmentOtpMode()
                    ? {
                        phoneOtpHash: hashOtp(otp),
                        phoneOtpExpiry: new Date(Date.now() + 10 * 60 * 1000)
                    }
                    : {})
        });

        if (accountRole === "hospital") {
            const hospital = await Hospital.create({
                name: hospitalName.trim(),
                address: address.trim(),
                registrationNumber: registrationNumber.trim(),
                country: country.trim(),
                city: city.trim(),
                state: state.trim(),
                postalCode: postalCode.trim(),
                speciality: speciality || "Multi-speciality",
                contact: cleanPhone,
                userId: user._id,
                verified: false,
                ...(geocodedCoordinates || {}),
                inventory: []
            });

            user.hospitalId = hospital._id;
            await user.save();
        }

        if (developmentOtpMode()) {
            return res.status(201).json({
                success: true,
                message: `Development account created. Use the displayed code to verify your ${verificationMethod === "email" ? "email" : "phone"}.${geocodingWarning ? ` ${geocodingWarning}` : ""}`,
                role: accountRole,
                verificationMethod,
                developmentOtp: { code: otp }
            });
        }

        if (verificationMethod === "email") {
            await sendEmail({
                to: cleanEmail,
                subject: "OrganRoute Email Verification",
                text: `Your verification code is ${otp}. It expires in 10 minutes.`
            });
        } else {
            await twilioVerifyService().verifications.create({
                to: cleanPhone,
                channel: "sms"
            });
        }

        return res.status(201).json({
            success: true,
            message: `${verificationMethod === "email"
                ? "Registration successful. An email verification code has been sent."
                : "Registration successful. An SMS verification code has been sent."}${geocodingWarning ? ` ${geocodingWarning}` : ""}`,
            verificationMethod,
            role: accountRole
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        if (user) {
            await Hospital.deleteOne({ userId: user._id }).catch(() => {});
            await User.deleteOne({ _id: user._id }).catch(() => {});
        }

        return res.status(500).json({
            success: false,
            message: "Registration or OTP delivery failed. Check email and Twilio configuration."
        });
    }
});

// VERIFY EMAIL OTP
router.post("/verify-email", emailVerificationLimiter, async (req, res) => {
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

        if (user.verificationMethod && user.verificationMethod !== "email") {
            return res.status(400).json({
                success: false,
                message: "This account selected phone verification."
            });
        }

        if (user.emailVerified) {
            return res.json({
                success: true,
                message: "Email was already verified."
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

// VERIFY SMS OTP
router.post("/verify-phone", phoneVerificationLimiter, async (req, res) => {
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
        const user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.verificationMethod && user.verificationMethod !== "phone") {
            return res.status(400).json({
                success: false,
                message: "This account selected email verification."
            });
        }

        if (user.phoneVerified) {
            return res.json({
                success: true,
                message: "Phone was already verified."
            });
        }

        if (developmentOtpMode()) {
            if (
                !user.phoneOtpHash ||
                !user.phoneOtpExpiry ||
                user.phoneOtpExpiry.getTime() < Date.now() ||
                hashOtp(otp) !== user.phoneOtpHash
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired SMS OTP."
                });
            }
        } else {
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
        }

        user.phoneVerified = true;
        user.phoneOtpHash = null;
        user.phoneOtpExpiry = null;
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

// LOGIN AND ISSUE JWT
async function login(req, res) {
    try {
        const { email, password, role } = req.body;
        const forcedRole = req.path === "/driver/login" ? "driver" : null;

        if (
            typeof email !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }
        if (!forcedRole && !["patient", "hospital"].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Use the designated sign-in route for this account type."
            });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.role !== (forcedRole || role)) {
            return res.status(403).json({
                success: false,
                message: "This account does not belong to the selected login type."
            });
        }

        const selectedContactVerified = user.verificationMethod === "phone"
            ? user.phoneVerified
            : user.verificationMethod === "email"
                ? user.emailVerified
                : user.emailVerified && user.phoneVerified;

        if (!selectedContactVerified) {
            return res.status(403).json({
                success: false,
                message: "Verify the contact method selected during registration before login."
            });
        }

        if (user.role === "driver" && !user.approved) {
            return res.status(403).json({
                success: false,
                message: "Your driver account is waiting for hospital approval."
            });
        }
        if (user.role === "driver" && user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: "Your driver account has been deactivated by your hospital."
            });
        }

        const token = createToken(user);

        return res.json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                verificationMethod: user.verificationMethod,
                hospitalId: user.hospitalId,
                approved: user.approved,
                approvalStatus: user.approvalStatus,
                vehicleNumber: user.vehicleNumber
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
}

router.post("/login", loginLimiter, login);
router.post("/driver/login", loginLimiter, login);

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        const email = typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address."
            });
        }
        const developmentMode = developmentPasswordResetMode();
        const emailAvailable = !developmentMode && otpProviderConfigured("email");
        if (!emailAvailable && !developmentMode) {
            return res.status(503).json({
                success: false,
                message: "Password reset email is not configured. Contact the platform administrator or enable local development reset mode."
            });
        }

        const user = await User.findOne({ email });
        const token = crypto.randomBytes(32).toString("hex");
        const baseUrl = process.env.APP_BASE_URL || "http://localhost:5050";
        const resetUrl = new URL("/", baseUrl);
        resetUrl.searchParams.set("passwordReset", token);
        const selectedRole = ["patient", "hospital", "driver", "admin"].includes(req.body?.role)
            ? req.body.role
            : "patient";
        if (developmentMode) {
            resetUrl.searchParams.set("role", selectedRole);
        } else if (user) {
            resetUrl.searchParams.set("role", user.role);
        }

        if (user) {
            user.passwordResetHash = hashOtp(token);
            user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);
            await user.save();
            if (emailAvailable) {
                try {
                    await sendEmail({
                        to: user.email,
                        subject: "OrganRoute password reset",
                        text: `Use this link within 60 minutes to set a new password: ${resetUrl.toString()}`
                    });
                } catch (error) {
                    console.error("Password reset email delivery failed:", error.message);
                    user.passwordResetHash = null;
                    user.passwordResetExpiry = null;
                    await user.save();
                }
            }
        }

        const result = {
            success: true,
            message: "If an account exists for that email, a secure reset link will be sent if email delivery is available."
        };
        if (developmentMode) {
            result.developmentMode = true;
            result.developmentResetUrl = resetUrl.toString();
            result.message = "Development mode: no email was sent. For an existing account, use the one-time reset link below.";
        }
        return res.json(result);
    } catch (error) {
        console.error("Password reset request error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to send a password reset link right now."
        });
    }
});

router.post("/reset-password", passwordResetLimiter, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
        const { token, password, confirmPassword } = req.body || {};
        if (
            typeof token !== "string" ||
            !/^[a-f0-9]{64}$/i.test(token) ||
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 128 ||
            typeof confirmPassword !== "string" ||
            password !== confirmPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid reset link and matching passwords of 8 to 128 characters."
            });
        }

        const user = await User.findOne({
            passwordResetHash: hashOtp(token),
            passwordResetExpiry: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "This password reset link is invalid or expired."
            });
        }

        user.password = await bcrypt.hash(password, 12);
        user.passwordResetHash = null;
        user.passwordResetExpiry = null;
        user.authVersion = (user.authVersion || 0) + 1;
        await user.save();
        return res.json({
            success: true,
            message: "Password updated. You can now sign in with your new password."
        });
    } catch (error) {
        console.error("Password reset error:", error.message);
        return res.status(500).json({
            success: false,
            message: "Unable to reset the password right now."
        });
    }
});

module.exports = router;
