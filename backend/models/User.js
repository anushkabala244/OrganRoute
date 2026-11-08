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
            unique: true,
            trim: true
        },

        vehicleNumber: {
            type: String,
            trim: true,
            uppercase: true,
            default: ""
        },

        vehicleType: {
            type: String,
            trim: true,
            default: ""
        },

        isActive: {
            type: Boolean,
            default: true
        },

        availabilityStatus: {
            type: String,
            enum: ["available", "unavailable"],
            default: "available"
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ["patient", "hospital", "driver", "admin"],
            default: "patient",
            required: true
        },

        approved: {
            type: Boolean,
            default: false
        },

        approvalStatus: {
            type: String,
            enum: ["pending", "approved", "rejected", "not_required"],
            default: function () {
                if (this.role === "hospital" || this.role === "driver") return "pending";
                if (this.role === "admin") return "approved";
                return "not_required";
            }
        },

        hospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            default: null
        },

        emailVerified: {
            type: Boolean,
            default: false
        },

        phoneVerified: {
            type: Boolean,
            default: false
        },

        verificationMethod: {
            type: String,
            enum: ["email", "phone"],
            default: null
        },

        emailOtpHash: {
            type: String,
            default: null
        },

        emailOtpExpiry: {
            type: Date,
            default: null
        },

        phoneOtpHash: {
            type: String,
            default: null
        },

        phoneOtpExpiry: {
            type: Date,
            default: null
        },

        passwordResetHash: {
            type: String,
            default: null
        },

        passwordResetExpiry: {
            type: Date,
            default: null
        },

        authVersion: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);