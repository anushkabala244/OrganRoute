
const mongoose = require("mongoose");

const documentReviewSchema = new mongoose.Schema(
    {
        hospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "verified", "rejected", "superseded"],
            default: "pending"
        },
        reason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);

const hospitalResponseSchema = new mongoose.Schema({
    hospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hospital",
        required: true
    },
    status: {
        type: String,
        enum: [
            "Pending Verification",
            "Pending Medical Review",
            "Approved",
            "Rejected",
            "Assigned",
            "In Transit",
            "Delivered"
        ],
        default: "Pending Verification"
    },
    responseReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
    },
    clinicalPriority: {
        type: String,
        enum: ["needs_review", "routine", "urgent", "critical"],
        default: "needs_review"
    },
    priorityReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ""
    },
    clinicalReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    clinicalReviewedAt: {
        type: Date,
        default: null
    },
    priorityHistory: {
        type: [{
            priority: {
                type: String,
                enum: ["needs_review", "routine", "urgent", "critical"],
                required: true
            },
            reason: {
                type: String,
                trim: true,
                maxlength: 1000,
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
        }],
        default: []
    },
    deliveryPreference: {
        type: String,
        enum: ["pending", "self", "delivery"],
        default: "pending"
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    recipientHospitalId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hospital",
        default: null
    },
    respondedAt: {
        type: Date,
        default: null
    }
});

const requestSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        hospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            default: null
        },

        sourceHospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            default: null
        },

        recipientHospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            default: null
        },

        organType: {
            type: String,
            required: true,
            enum: [
                "Kidney",
                "Liver",
                "Heart",
                "Lungs",
                "Pancreas",
                "Intestine"
            ]
        },

        urgency: {
            type: String,
            required: true,
            enum: ["Low", "Medium", "High", "Critical"],
            default: "Medium"
        },

        clinicalPriority: {
            type: String,
            enum: ["needs_review", "routine", "urgent", "critical"],
            default: "needs_review"
        },

        clinicalReviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        clinicalReviewedAt: {
            type: Date,
            default: null
        },

        hospitalResponses: {
            type: [hospitalResponseSchema],
            default: []
        },

        documents: {
            type: [{
                originalName: {
                    type: String,
                    required: true
                },
                storedName: {
                    type: String,
                    required: true,
                    select: false
                },
                mimeType: {
                    type: String,
                    enum: ["application/pdf", "image/jpeg", "image/png"],
                    required: true
                },
                size: {
                    type: Number,
                    required: true,
                    min: 1
                },
                isDemoSample: {
                    type: Boolean,
                    default: false
                },
                demoProfileName: {
                    type: String,
                    trim: true,
                    default: ""
                },
                demoDocumentType: {
                    type: String,
                    trim: true,
                    default: ""
                },
                reviewByHospital: {
                    type: [documentReviewSchema],
                    default: []
                },
                uploadedAt: {
                    type: Date,
                    default: Date.now
                }
            }],
            default: []
        },

        priorityScore: {
            type: Number,
            default: 0,
            min: 0
        },

        sourceHospital: {
            type: String,
            trim: true,
            default: ""
        },

        recipientHospital: {
            type: String,
            trim: true,
            default: ""
        },

        sourceLocation: {
            type: String,
            trim: true,
            default: ""
        },

        destinationLocation: {
            type: String,
            trim: true,
            default: ""
        },

        distance: {
            type: Number,
            default: 0,
            min: 0
        },

        estimatedTime: {
            type: String,
            default: ""
        },

        route: {
            type: [String],
            default: []
        },

        status: {
            type: String,
            enum: [
                "Pending",
                "Pending Verification",
                "Pending Medical Review",
                "Approved",
                "Assigned",
                "In Transit",
                "Delivered",
                "Rejected",
                "Cancelled"
            ],
            default: "Pending"
        },

        deliveryPreference: {
            type: String,
            enum: ["pending", "self", "delivery"],
            default: "pending"
        },

        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        selectedRouteId: {
            type: String,
            default: ""
        },

        shortestRouteId: {
            type: String,
            default: ""
        },

        routeWarning: {
            type: String,
            default: ""
        },

        routeOptions: {
            type: [{
                id: String,
                name: String,
                distanceKm: Number,
                durationMinutes: Number,
                geometry: mongoose.Schema.Types.Mixed,
                steps: [{
                    instruction: String,
                    roadName: String,
                    distanceMeters: Number,
                    distanceText: String,
                    maneuverType: String,
                    modifier: String
                }]
            }],
            default: []
        },

        selectedRoute: {
            distanceKm: {
                type: Number,
                min: 0,
                default: null
            },
            durationMinutes: {
                type: Number,
                min: 0,
                default: null
            },
            geometry: {
                type: mongoose.Schema.Types.Mixed,
                default: null
            },
            steps: [{
                instruction: String,
                roadName: String,
                distanceMeters: Number,
                distanceText: String,
                maneuverType: String,
                modifier: String
            }]
        },

        driverLocation: {
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
            updatedAt: {
                type: Date,
                default: null
            }
        },

        deliveryStartedAt: {
            type: Date,
            default: null
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

requestSchema.index({ patientId: 1, createdAt: -1 });
requestSchema.index({ hospitalId: 1, status: 1 });
requestSchema.index({ driverId: 1, deliveryPreference: 1, status: 1 });
requestSchema.index({ hospitalId: 1, clinicalPriority: 1, status: 1 });
requestSchema.index({ "hospitalResponses.hospitalId": 1, "hospitalResponses.status": 1 });

module.exports = mongoose.model("Request", requestSchema);
