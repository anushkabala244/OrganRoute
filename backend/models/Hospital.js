const mongoose = require("mongoose");

const inventoryHistorySchema = new mongoose.Schema({
    previousAvailableUnits: {
        type: Number,
        min: 0,
        default: null
    },
    availableUnits: {
        type: Number,
        min: 0,
        required: true
    },
    reason: {
        type: String,
        trim: true,
        maxlength: 500,
        required: true
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    changedAt: {
        type: Date,
        default: Date.now
    }
});

const inventorySchema = new mongoose.Schema({
    organType: {
        type: String,
        enum: [
            "Kidney",
            "Liver",
            "Heart",
            "Lungs",
            "Pancreas",
            "Intestine"
        ],
        required: true
    },

    availableUnits: {
        type: Number,
        min: 0,
        default: 0
    },

    status: {
        type: String,
        enum: ["Available", "Limited", "Unavailable"],
        default: "Available"
    },

    updatedAt: {
        type: Date,
        default: Date.now
    },

    history: {
        type: [inventoryHistorySchema],
        default: []
    }
});

const hospitalSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        city: {
            type: String,
            required: true,
            trim: true
        },

        state: {
            type: String,
            required: true,
            trim: true
        },

        address: {
            type: String,
            trim: true,
            default: ""
        },

        registrationNumber: {
            type: String,
            trim: true,
            default: ""
        },

        latitude: {
            type: Number,
            min: -90,
            max: 90,
            default: null
        },

        longitude: {
            type: Number,
            min: -180,
            max: 180,
            default: null
        },

        speciality: {
            type: String,
            default: "Multi-speciality"
        },

        contact: {
            type: String,
            default: ""
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        verified: {
            type: Boolean,
            default: false
        },

        // Identifies fictional hospitals used for project demonstration
        isDemo: {
            type: Boolean,
            default: false
        },

        inventory: {
            type: [inventorySchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.models.Hospital ||
    mongoose.model("Hospital", hospitalSchema);