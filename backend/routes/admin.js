
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Load the backend .env file directly
require("dotenv").config({
    path: path.resolve(__dirname, "../.env"),
    override: true
});

const JWT_SECRET = process.env.JWT_SECRET;

const User = require("../models/User");
const Hospital = require("../models/Hospital");
const { geocodeAddress } = require("../services/geocodingService");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false
});

// ADMIN AUTHENTICATION
async function authenticateAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Admin authentication token is required."
            });
        }

        if (!JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT configuration is missing."
            });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const admin = await User.findById(decoded.sub)
            .select("-password -emailOtpHash -emailOtpExpiry -phoneOtpHash -phoneOtpExpiry -passwordResetHash -passwordResetExpiry");

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access only."
            });
        }
        if ((decoded.ver || 0) !== (admin.authVersion || 0)) {
            return res.status(401).json({
                success: false,
                message: "This session is no longer valid. Please sign in again."
            });
        }

        req.admin = admin;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired admin token."
        });
    }
}

// ADMIN LOGIN
router.post("/login", loginLimiter, async (req, res) => {
    try {
        const { email, phone, password } = req.body;
        const usePhone = typeof phone === "string";

        if (
            (!usePhone && typeof email !== "string") ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Email or phone, and password are required."
            });
        }

        const loginPhone = usePhone ? phone.trim() : "";
        if (usePhone && !/^\+[1-9]\d{7,14}$/.test(loginPhone)) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid phone number with country code."
            });
        }

        if (!JWT_SECRET) {
            console.error("JWT_SECRET is not loaded in admin.js");

            return res.status(500).json({
                success: false,
                message: "JWT configuration is missing."
            });
        }

        const admin = await User.findOne({
            ...(usePhone
                ? { phone: loginPhone }
                : { email: email.trim().toLowerCase() }),
            role: "admin"
        });

        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin email or password."
            });
        }

        const token = jwt.sign(
            {
                sub: admin._id.toString(),
                role: "admin",
                ver: admin.authVersion || 0
            },
            JWT_SECRET,
            { expiresIn: "8h" }
        );

        return res.json({
            success: true,
            message: "Admin login successful.",
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            success: false,
            message: "Admin login failed."
        });
    }
});

// GET PENDING HOSPITAL APPLICATIONS
router.get("/hospitals/pending", authenticateAdmin, async (req, res) => {
    try {
        const pendingUsers = await User.find({
            role: "hospital",
            approved: false,
            $or: [
                { approvalStatus: "pending" },
                { approvalStatus: { $exists: false } }
            ]
        })
            .select("-password -emailOtpHash -emailOtpExpiry -phoneOtpHash -phoneOtpExpiry -passwordResetHash -passwordResetExpiry")
            .sort({ createdAt: -1 })
            .lean();

        const userIds = pendingUsers.map(user => user._id);

        const hospitals = await Hospital.find({
            userId: { $in: userIds }
        }).lean();

        const hospitalMap = new Map(
            hospitals.map(hospital => [
                hospital.userId.toString(),
                hospital
            ])
        );

        const applications = pendingUsers.map(user => ({
            user,
            hospital: hospitalMap.get(user._id.toString()) || null
        }));

        return res.json({
            success: true,
            total: applications.length,
            applications
        });
    } catch (error) {
        console.error("Pending hospitals error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch pending hospital applications."
        });
    }
});

// APPROVE HOSPITAL
router.patch(
    "/hospitals/:userId/approve",
    authenticateAdmin,
    async (req, res) => {
        try {
            const { userId } = req.params;

            if (!/^[a-fA-F0-9]{24}$/.test(userId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hospital user ID."
                });
            }

            const user = await User.findOne({
                _id: userId,
                role: "hospital"
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital user not found."
                });
            }

            const hospital = await Hospital.findOne({
                userId: user._id
            });

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital profile not found."
                });
            }

            let locationWarning = "";
            if (
                !Number.isFinite(hospital.latitude) ||
                !Number.isFinite(hospital.longitude)
            ) {
                try {
                    const coordinates = await geocodeAddress({
                        address: hospital.address,
                        city: hospital.city,
                        state: hospital.state,
                        postalCode: hospital.postalCode,
                        country: hospital.country || "India"
                    });
                    if (coordinates) {
                        hospital.latitude = coordinates.latitude;
                        hospital.longitude = coordinates.longitude;
                    } else {
                        locationWarning =
                            "Hospital location could not be resolved automatically. Routing remains unavailable until coordinates are resolved.";
                    }
                } catch (error) {
                    console.error("Hospital approval geocoding failed:", error.message);
                    locationWarning =
                        "Automatic location lookup is unavailable. Routing remains unavailable until coordinates are resolved.";
                }
            }

            user.approved = true;
            user.approvalStatus = "approved";
            hospital.verified = true;

            await user.save();
            await hospital.save();

            return res.json({
                success: true,
                message: `Hospital approved successfully.${locationWarning ? ` ${locationWarning}` : ""}`,
                hospital: {
                    id: hospital._id,
                    name: hospital.name,
                    city: hospital.city,
                    state: hospital.state,
                    verified: hospital.verified
                }
            });
        } catch (error) {
            console.error("Hospital approval error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to approve hospital."
            });
        }
    }
);

// REJECT HOSPITAL
router.patch(
    "/hospitals/:userId/reject",
    authenticateAdmin,
    async (req, res) => {
        try {
            const { userId } = req.params;

            if (!/^[a-fA-F0-9]{24}$/.test(userId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid hospital user ID."
                });
            }

            const user = await User.findOne({
                _id: userId,
                role: "hospital"
            });

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital user not found."
                });
            }

            const hospital = await Hospital.findOne({
                userId: user._id
            });

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital profile not found."
                });
            }

            user.approved = false;
            user.approvalStatus = "rejected";
            hospital.verified = false;

            await user.save();
            await hospital.save();

            return res.json({
                success: true,
                message: "Hospital application rejected.",
                hospital: {
                    id: hospital._id,
                    name: hospital.name,
                    verified: hospital.verified
                }
            });
        } catch (error) {
            console.error("Hospital rejection error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to reject hospital application."
            });
        }
    }
);

module.exports = router;
