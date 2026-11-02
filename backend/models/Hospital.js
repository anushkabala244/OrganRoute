const mongoose = require("mongoose");

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
        speciality: {
            type: String,
            required: true,
            trim: true
        },
        contact: {
            type: String,
            default: ""
        },
        verified: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Hospital", hospitalSchema);