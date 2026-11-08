
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function createAdmin() {
    try {
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;

        if (!email || !password) {
            throw new Error(
                "ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env"
            );
        }

        if (password.length < 12) {
            throw new Error(
                "Admin password must contain at least 12 characters."
            );
        }

        await mongoose.connect(process.env.MONGODB_URI);

        const existingAdmin = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (existingAdmin) {
            if (existingAdmin.role !== "admin") {
                throw new Error(
                    "This email already belongs to a non-admin account."
                );
            }

            console.log("Admin account already exists.");
            return;
        }

        const admin = await User.create({
            name: "OrganRoute Admin",
            email: email.trim().toLowerCase(),
            phone: process.env.ADMIN_PHONE,
            password: await bcrypt.hash(password, 12),
            role: "admin",
            approved: true,
            emailVerified: true,
            phoneVerified: true
        });

        console.log("Admin account created successfully!");
        console.log("Admin ID:", admin._id);
        console.log("Admin Email:", admin.email);
    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();
