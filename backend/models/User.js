const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        emailVerified: {
            type: Boolean,
            default: false
        },
        phoneVerified: {
            type: Boolean,
            default: false
        },
        emailOtpHash: {
            type: String,
            default: null
        },
        emailOtpExpiry: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);