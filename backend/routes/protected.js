
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Hospital = require("../models/Hospital");
const Request = require("../models/Request");
const { calculateHospitalRoute } = require("../services/routingService");
const {
    ensureDemoDocuments,
    getDemoDocument,
    getDemoDocumentCatalog,
    privateUploadDirectory
} = require("../services/demoDocuments");
const { emailConfigured, sendEmail } = require("../services/emailService");

const router = express.Router();
const webRoot = path.resolve(__dirname, "../..");
const uploadDirectoryRelativeToWebRoot = path.relative(
    webRoot,
    privateUploadDirectory
);
if (
    !uploadDirectoryRelativeToWebRoot ||
    (!uploadDirectoryRelativeToWebRoot.startsWith(`..${path.sep}`) &&
        uploadDirectoryRelativeToWebRoot !== ".." &&
        !path.isAbsolute(uploadDirectoryRelativeToWebRoot))
) {
    throw new Error("PRIVATE_UPLOAD_DIR must be outside the publicly served web root.");
}
const allowedDocumentTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png"
]);
const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024,
        fields: 10,
        fieldSize: 10 * 1024
    },
    fileFilter: (req, file, callback) => {
        if (!allowedDocumentTypes.has(file.mimetype)) {
            return callback(new Error("Upload PDF, JPG or PNG documents only."));
        }
        callback(null, true);
    }
});

function receiveRequestDocuments(req, res, next) {
    documentUpload.array("documents", 5)(req, res, error => {
        if (!error) return next();
        const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT"
            ? 413
            : 400;
        return res.status(status).json({
            success: false,
            message: error.code === "LIMIT_FILE_SIZE"
                ? "Each document must be 5 MB or smaller."
                : error.code === "LIMIT_FILE_COUNT"
                    ? "Upload no more than five documents."
                    : error.message
        });
    });
}

function hasExpectedFileSignature(file) {
    if (file.mimetype === "application/pdf") {
        return file.buffer.subarray(0, 5).toString() === "%PDF-";
    }
    if (file.mimetype === "image/jpeg") {
        return file.buffer.length >= 3 &&
            file.buffer[0] === 0xff &&
            file.buffer[1] === 0xd8 &&
            file.buffer[2] === 0xff;
    }
    if (file.mimetype === "image/png") {
        return file.buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
    }
    return false;
}

function safeOriginalName(name) {
    return name
        .replace(/[\x00-\x1f\x7f]/g, "")
        .split(/[\\/]/)
        .pop()
        .slice(0, 180) || "document";
}

async function storeRequestDocuments(files, sampleDocuments = []) {
    await fs.mkdir(privateUploadDirectory, { recursive: true, mode: 0o700 });
    await fs.chmod(privateUploadDirectory, 0o700);
    const stored = [];
    const extensions = {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png"
    };

    try {
        for (const file of files) {
            if (!hasExpectedFileSignature(file)) {
                const error = new Error("A document file does not match its declared format.");
                error.statusCode = 400;
                throw error;
            }
            const storedName = `${crypto.randomUUID()}${extensions[file.mimetype]}`;
            await fs.writeFile(
                path.join(privateUploadDirectory, storedName),
                file.buffer,
                { flag: "wx", mode: 0o600 }
            );
            const sample = sampleDocuments.find(item =>
                item.fileName === safeOriginalName(file.originalname)
            );
            stored.push({
                originalName: safeOriginalName(file.originalname),
                storedName,
                mimeType: file.mimetype,
                size: file.size,
                isDemoSample: Boolean(sample),
                demoProfileName: sample?.profileName || "",
                demoDocumentType: sample?.label || ""
            });
        }
        return stored;
    } catch (error) {
        await Promise.all(stored.map(file =>
            fs.unlink(path.join(privateUploadDirectory, file.storedName))
        ));
        throw error;
    }
}

// Authentication middleware
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is required."
            });
        }

        const token = authHeader.split(" ")[1];

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT configuration is missing."
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.sub)
            .select("-password -emailOtpHash -emailOtpExpiry -phoneOtpHash -phoneOtpExpiry -passwordResetHash -passwordResetExpiry");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account not found."
            });
        }
        if ((decoded.ver || 0) !== (user.authVersion || 0)) {
            return res.status(401).json({
                success: false,
                message: "This session is no longer valid. Please sign in again."
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token."
        });
    }
}

// Role authorization middleware
function allow(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to access this resource."
            });
        }

        next();
    };
}

function requireApprovedDriver(req, res, next) {
    if (!req.user.approved || req.user.isActive === false) {
        return res.status(403).json({
            success: false,
            message: req.user.isActive !== false
                ? "Your driver account is awaiting hospital approval."
                : "Your driver account has been deactivated by your hospital."
        });
    }
    next();
}

// GET logged-in user's profile
router.get("/me", authenticate, async (req, res) => {
    try {
        res.json({
            success: true,
            user: req.user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Unable to fetch profile."
        });
    }
});

// PATIENT DASHBOARD
router.get(
    "/patient/dashboard",
    authenticate,
    allow("patient"),
    async (req, res) => {
        try {
            const requests = await Request.find({
                patientId: req.user._id
            })
                .populate("hospitalId", "name city state")
                .populate("driverId", "name phone vehicleNumber vehicleType")
                .populate("hospitalResponses.hospitalId", "name city state verified")
                .populate("documents.reviewByHospital.hospitalId", "name")
                .select("-selectedRoute -routeOptions -driverLocation")
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                message: "Patient dashboard data fetched.",
                user: req.user,
                totalRequests: requests.length,
                requests
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load patient dashboard."
            });
        }
    }
);

router.get(
    "/patient/hospitals",
    authenticate,
    allow("patient"),
    async (req, res) => {
        try {
            const { organType } = req.query;
            const allowedOrgans = [
                "Kidney",
                "Liver",
                "Heart",
                "Lungs",
                "Pancreas",
                "Intestine"
            ];
            if (!allowedOrgans.includes(organType)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid organ type."
                });
            }

            const hospitals = await Hospital.find({
                verified: true,
                inventory: {
                    $elemMatch: {
                        organType,
                        availableUnits: { $gt: 0 },
                        status: { $ne: "Unavailable" }
                    }
                }
            }).select("name city state inventory");

            res.json({
                success: true,
                totalHospitals: hospitals.length,
                hospitals: hospitals.map(hospital => {
                    const item = hospital.inventory.find(entry =>
                        entry.organType === organType &&
                        entry.availableUnits > 0 &&
                        entry.status !== "Unavailable"
                    );
                    return {
                        id: hospital._id.toString(),
                        name: hospital.name,
                        city: hospital.city,
                        state: hospital.state,
                        availableUnits: item.availableUnits,
                        availabilityStatus: item.status,
                        verified: hospital.verified
                    };
                })
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load hospitals with this organ listed."
            });
        }
    }
);

router.get(
    "/patient/demo-documents",
    authenticate,
    allow("patient"),
    async (req, res) => {
        try {
            const profiles = await ensureDemoDocuments();
            res.set("Cache-Control", "private, no-store");
            res.json({
                success: true,
                disclaimer: "DEMO DOCUMENT – FICTIONAL DATA – NOT VALID FOR MEDICAL USE",
                profiles
            });
        } catch (error) {
            console.error("Demo document generation error:", error.message);
            res.status(500).json({
                success: false,
                message: "Unable to prepare fictional sample documents."
            });
        }
    }
);

router.get(
    "/patient/demo-documents/:sampleId",
    authenticate,
    allow("patient"),
    async (req, res) => {
        try {
            const sampleId = decodeURIComponent(req.params.sampleId);
            const document = await getDemoDocument(sampleId);
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: "Fictional sample document not found."
                });
            }
            await ensureDemoDocuments();
            const file = await fs.readFile(document.path);
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${document.fileName}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff"
            });
            res.send(file);
        } catch (error) {
            console.error("Demo document preview error:", error.message);
            res.status(500).json({
                success: false,
                message: "Unable to open this fictional sample document."
            });
        }
    }
);

function updateOverallRequestStatus(request) {
    const responses = request.hospitalResponses || [];
    if (!responses.length) return;
    if (responses.some(response => response.status === "In Transit")) {
        request.status = "In Transit";
    } else if (responses.some(response => response.status === "Assigned")) {
        request.status = "Assigned";
    } else if (responses.some(response => response.status === "Approved")) {
        request.status = "Approved";
    } else if (responses.every(response => response.status === "Rejected")) {
        request.status = "Rejected";
    } else if (responses.some(response => response.status === "Pending Medical Review")) {
        request.status = "Pending Medical Review";
    } else {
        request.status = "Pending Verification";
    }
}

// One patient request is shared with every verified hospital reporting availability.
router.post(
    "/patient/requests",
    authenticate,
    allow("patient"),
    receiveRequestDocuments,
    async (req, res) => {
        let storedDocuments = [];
        try {
            const { organType, notes } = req.body;

            if (
                !organType ||
                !req.files?.length
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Choose an organ and attach at least one verification document."
                });
            }

            const allowedOrgans = [
                "Kidney",
                "Liver",
                "Heart",
                "Lungs",
                "Pancreas",
                "Intestine"
            ];

            if (!allowedOrgans.includes(organType)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid organ type."
                });
            }

            const hospitals = await Hospital.find({
                verified: true,
                inventory: {
                    $elemMatch: {
                        organType,
                        availableUnits: { $gt: 0 },
                        status: { $ne: "Unavailable" }
                    }
                }
            });
            if (!hospitals.length) {
                return res.status(400).json({
                    success: false,
                    message: "No verified hospital currently lists this organ as available. Please try again later."
                });
            }

            if (typeof notes !== "string" || notes.length > 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Coordination note must be 1,000 characters or fewer."
                });
            }

            let sampleIds = [];
            if (req.body.demoSampleIds) {
                try {
                    sampleIds = JSON.parse(req.body.demoSampleIds);
                } catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid sample document selection."
                    });
                }
                if (!Array.isArray(sampleIds) || sampleIds.length > 5) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid sample document selection."
                    });
                }
            }
            const sampleDocuments = sampleIds.length
                ? (await ensureDemoDocuments()).flatMap(profile =>
                    profile.documents
                        .filter(document => sampleIds.includes(document.id))
                        .map(document => ({ ...document, profileName: profile.name }))
                )
                : [];
            if (
                sampleDocuments.length !== sampleIds.length ||
                sampleDocuments.some(sample =>
                    !req.files.some(file =>
                        safeOriginalName(file.originalname) === sample.fileName
                    )
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Sample document files do not match the selected fictional samples."
                });
            }

            storedDocuments = await storeRequestDocuments(req.files, sampleDocuments);
            const newRequest = await Request.create({
                patientId: req.user._id,
                organType,
                status: "Pending Verification",
                documents: storedDocuments,
                hospitalResponses: hospitals.map(hospital => ({
                    hospitalId: hospital._id,
                    status: "Pending Verification",
                    clinicalPriority: "needs_review",
                    deliveryPreference: "pending"
                })),
                notes: notes.trim()
            });

            res.status(201).json({
                success: true,
                message: `One request and its documents were sent privately to ${hospitals.length} verified hospital(s) reporting availability.`,
                requestId: newRequest._id,
                hospitalsNotified: hospitals.length
            });
        } catch (error) {
            await Promise.all(storedDocuments.map(file =>
                fs.unlink(path.join(privateUploadDirectory, file.storedName))
            ));
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Unable to create request."
            });
        }
    }
);

router.post(
    "/patient/requests/:id/documents",
    authenticate,
    allow("patient"),
    receiveRequestDocuments,
    async (req, res) => {
        let storedDocuments = [];
        try {
            if (!/^[a-fA-F0-9]{24}$/.test(req.params.id) || !req.files?.length) {
                return res.status(400).json({
                    success: false,
                    message: "Choose an existing request and at least one replacement document."
                });
            }
            const request = await Request.findOne({
                _id: req.params.id,
                patientId: req.user._id
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found."
                });
            }
            if (!/^[a-fA-F0-9]{24}$/.test(req.body.replacesDocumentId || "")) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid document ID to replace."
                });
            }
            const rejectedDocument = request.documents.id(req.body.replacesDocumentId);
            if (!rejectedDocument) {
                return res.status(404).json({
                    success: false,
                    message: "Document to replace was not found."
                });
            }
            const rejectedReviews = rejectedDocument.reviewByHospital.filter(review =>
                review.status === "rejected"
            );
            if (!rejectedReviews.length) {
                return res.status(409).json({
                    success: false,
                    message: "Only a document rejected by a hospital can be replaced."
                });
            }

            storedDocuments = await storeRequestDocuments(req.files);
            const hospitalIds = rejectedReviews.map(review => review.hospitalId);
            for (const review of rejectedReviews) review.status = "superseded";
            for (const hospitalId of hospitalIds) {
                const response = request.hospitalResponses.find(entry =>
                    entry.hospitalId.toString() === hospitalId.toString()
                );
                if (response) {
                    response.status = "Pending Verification";
                    response.clinicalPriority = "needs_review";
                    response.priorityReason = "";
                    response.clinicalReviewedBy = null;
                    response.clinicalReviewedAt = null;
                }
            }
            for (const file of storedDocuments) {
                request.documents.push({
                    ...file,
                    reviewByHospital: hospitalIds.map(hospitalId => ({
                        hospitalId,
                        status: "pending"
                    }))
                });
            }
            updateOverallRequestStatus(request);
            await request.save();
            res.status(201).json({
                success: true,
                message: "Replacement document privately uploaded. The rejecting hospital(s) can review it.",
                requestId: request._id,
                hospitalsReviewing: hospitalIds.length
            });
        } catch (error) {
            await Promise.all(storedDocuments.map(file =>
                fs.unlink(path.join(privateUploadDirectory, file.storedName))
            ));
            console.error("Replacement document upload error:", error.message);
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || "Unable to upload replacement documents."
            });
        }
    }
);

// HOSPITAL DASHBOARD
router.get(
    "/hospital/dashboard",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            if (!req.user.approved) {
                return res.status(403).json({
                    success: false,
                    message: "Your hospital account is awaiting admin approval."
                });
            }

            const hospital = await getVerifiedHospitalForUser(req.user);

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Hospital profile is not verified."
                });
            }

            const requests = await Request.find({
                $or: [
                    { "hospitalResponses.hospitalId": hospital._id },
                    { hospitalId: hospital._id, hospitalResponses: { $size: 0 } }
                ]
            })
                .populate("patientId", "name email phone")
                .populate("driverId", "name phone vehicleNumber vehicleType")
                .populate("hospitalResponses.hospitalId", "name city state")
                .populate("documents.reviewByHospital.hospitalId", "name")
                .select("-selectedRoute -routeOptions -driverLocation")
                .sort({ createdAt: -1 });
            const clinicalPriorityOrder = {
                needs_review: 0,
                critical: 1,
                urgent: 2,
                routine: 3
            };
            const hospitalRequests = requests.map(request => {
                const result = request.toObject();
                const response = request.hospitalResponses.find(entry =>
                    entry.hospitalId?._id?.toString() === hospital._id.toString() ||
                    entry.hospitalId?.toString() === hospital._id.toString()
                );
                result.hospitalResponse = response
                    ? response.toObject ? response.toObject() : response
                    : null;
                result.hospitalResponses = undefined;
                result.documents = (result.documents || []).map(document => ({
                    ...document,
                    reviewByHospital: (document.reviewByHospital || []).filter(review =>
                        String(review.hospitalId?._id || review.hospitalId) === hospital._id.toString()
                    )
                }));
                return result;
            });
            hospitalRequests.sort((first, second) =>
                clinicalPriorityOrder[first.hospitalResponse?.clinicalPriority] -
                    clinicalPriorityOrder[second.hospitalResponse?.clinicalPriority] ||
                new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
            );
            const routeDestinations = await Hospital.find({
                verified: true,
                latitude: { $type: "number" },
                longitude: { $type: "number" }
            }).select("_id name city state latitude longitude");

            res.json({
                success: true,
                message: "Hospital dashboard data fetched.",
                hospital,
                routeDestinations: routeDestinations.map(destination => ({
                    id: destination._id.toString(),
                    name: destination.name,
                    city: destination.city,
                    state: destination.state,
                    latitude: destination.latitude,
                    longitude: destination.longitude
                })),
                totalRequests: hospitalRequests.length,
                requests: hospitalRequests
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load hospital dashboard."
            });
        }
    }
);

router.patch(
    "/hospital/requests/:id/clinical-priority",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const { clinicalPriority, priorityReason } = req.body || {};
            if (
                !["routine", "urgent", "critical"].includes(clinicalPriority) ||
                typeof priorityReason !== "string" ||
                !priorityReason.trim() ||
                priorityReason.length > 1000
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a review level and provide a reason of 1,000 characters or fewer."
                });
            }

            const request = await Request.findOne({
                _id: req.params.id,
                $or: [
                    { "hospitalResponses.hospitalId": hospital._id },
                    { hospitalId: hospital._id, hospitalResponses: { $size: 0 } }
                ]
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Open request not found for this hospital."
                });
            }

            let response = request.hospitalResponses.find(entry =>
                entry.hospitalId.toString() === hospital._id.toString()
            );
            if (!response && request.hospitalId?.toString() === hospital._id.toString()) {
                response = request.hospitalResponses.create({
                    hospitalId: hospital._id,
                    status: "Pending Medical Review",
                    clinicalPriority: request.clinicalPriority || "needs_review"
                });
                request.hospitalResponses.push(response);
                response = request.hospitalResponses[request.hospitalResponses.length - 1];
            }
            if (!response || response.status !== "Pending Medical Review") {
                return res.status(409).json({
                    success: false,
                    message: "Complete verification of every submitted document before medical review."
                });
            }
            response.clinicalPriority = clinicalPriority;
            response.priorityReason = priorityReason.trim();
            response.clinicalReviewedBy = req.user._id;
            response.clinicalReviewedAt = new Date();
            response.priorityHistory.push({
                priority: clinicalPriority,
                reason: priorityReason.trim(),
                changedBy: req.user._id,
                changedAt: new Date()
            });
            request.clinicalPriority = clinicalPriority;
            request.clinicalReviewedBy = req.user._id;
            request.clinicalReviewedAt = response.clinicalReviewedAt;
            await request.save();

            res.json({
                success: true,
                message: "Hospital review level saved. This is a staff-entered assessment, not an automated medical decision."
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to save the hospital review level."
            });
        }
    }
);

router.get(
    "/hospital/requests/:id/documents/:documentId",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }
            if (
                !/^[a-fA-F0-9]{24}$/.test(req.params.id) ||
                !/^[a-fA-F0-9]{24}$/.test(req.params.documentId)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid request or document ID."
                });
            }

            const request = await Request.findOne({
                _id: req.params.id,
                $or: [
                    { "hospitalResponses.hospitalId": hospital._id },
                    { hospitalId: hospital._id, hospitalResponses: { $size: 0 } }
                ]
            }).select("+documents.storedName");
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found for this hospital."
                });
            }

            const document = request.documents.id(req.params.documentId);
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: "Document not found."
                });
            }

            const filePath = path.join(privateUploadDirectory, document.storedName);
            const file = await fs.readFile(filePath);
            res.set({
                "Content-Type": document.mimeType,
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff"
            });
            res.send(file);
        } catch (error) {
            if (error.code === "ENOENT") {
                return res.status(404).json({
                    success: false,
                    message: "Document file is unavailable."
                });
            }
            res.status(500).json({
                success: false,
                message: "Unable to download this verification document."
            });
        }
    }
);

router.patch(
    "/hospital/requests/:id/documents/:documentId/review",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }
            if (
                !/^[a-fA-F0-9]{24}$/.test(req.params.id) ||
                !/^[a-fA-F0-9]{24}$/.test(req.params.documentId)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid request or document ID."
                });
            }
            const { status, reason = "" } = req.body || {};
            if (!["verified", "rejected"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose Verified or Rejected for this document."
                });
            }
            if (
                typeof reason !== "string" ||
                reason.length > 1000 ||
                (status === "rejected" && !reason.trim())
            ) {
                return res.status(400).json({
                    success: false,
                    message: "A rejection reason of 1,000 characters or fewer is required."
                });
            }
            const request = await Request.findOne({
                _id: req.params.id,
                $or: [
                    { "hospitalResponses.hospitalId": hospital._id },
                    { hospitalId: hospital._id, hospitalResponses: { $size: 0 } }
                ]
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found for this hospital."
                });
            }
            const document = request.documents.id(req.params.documentId);
            if (!document) {
                return res.status(404).json({
                    success: false,
                    message: "Document not found."
                });
            }
            let review = document.reviewByHospital.find(entry =>
                entry.hospitalId.toString() === hospital._id.toString()
            );
            if (!review) {
                review = document.reviewByHospital.create({
                    hospitalId: hospital._id
                });
                document.reviewByHospital.push(review);
                review = document.reviewByHospital[document.reviewByHospital.length - 1];
            }
            review.status = status;
            review.reason = status === "rejected" ? reason.trim() : "";
            review.reviewedBy = req.user._id;
            review.reviewedAt = new Date();

            const response = request.hospitalResponses.find(entry =>
                entry.hospitalId.toString() === hospital._id.toString()
            );
            const hospitalResponse = response || (request.hospitalId?.toString() === hospital._id.toString()
                ? request.hospitalResponses.create({
                    hospitalId: hospital._id,
                    status: "Pending Verification"
                })
                : null);
            if (!response && hospitalResponse) {
                request.hospitalResponses.push(hospitalResponse);
            }
            if (hospitalResponse && request.documents.length > 0) {
                const reviews = request.documents.flatMap(entry => {
                    const item = entry.reviewByHospital.find(reviewEntry =>
                        reviewEntry.hospitalId.toString() === hospital._id.toString()
                    );
                    return !item || item.status === "superseded" ? [] : [item];
                });
                if (reviews.length > 0 && reviews.every(item => item.status === "verified")) {
                    hospitalResponse.status = "Pending Medical Review";
                    hospitalResponse.respondedAt = new Date();
                } else {
                    hospitalResponse.status = "Pending Verification";
                }
                updateOverallRequestStatus(request);
            }
            await request.save();
            res.json({
                success: true,
                message: status === "verified"
                    ? "Document marked verified for your hospital."
                    : "Document rejected with a reason.",
                requestStatus: hospitalResponse?.status || request.status
            });
        } catch (error) {
            console.error("Document review error:", error.message);
            res.status(500).json({
                success: false,
                message: "Unable to save document review."
            });
        }
    }
);

// HOSPITAL ADDS OR UPDATES ORGAN INVENTORY
router.post(
    "/hospital/inventory",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            if (!req.user.approved) {
                return res.status(403).json({
                    success: false,
                    message: "Hospital account is awaiting admin approval."
                });
            }

            const { organType, availableUnits, reason } = req.body;

            const allowedOrgans = [
                "Kidney",
                "Liver",
                "Heart",
                "Lungs",
                "Pancreas",
                "Intestine"
            ];

            if (
                !allowedOrgans.includes(organType) ||
                !Number.isInteger(availableUnits) ||
                availableUnits < 0 ||
                typeof reason !== "string" ||
                !reason.trim() ||
                reason.trim().length > 500
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Provide a valid organ type, non-negative whole number of units, and a reason of 500 characters or fewer."
                });
            }

            const hospital = await getVerifiedHospitalForUser(req.user);

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const existingItem = hospital.inventory.find(
                item => item.organType === organType
            );
            const availabilityStatus = availableUnits === 0
                ? "Unavailable"
                : availableUnits === 1
                    ? "Limited"
                    : "Available";

            if (existingItem) {
                existingItem.history.push({
                    previousAvailableUnits: existingItem.availableUnits,
                    availableUnits,
                    reason: reason.trim(),
                    changedBy: req.user._id
                });
                existingItem.availableUnits = availableUnits;
                existingItem.status = availabilityStatus;
                existingItem.updatedAt = new Date();
            } else {
                hospital.inventory.push({
                    organType,
                    availableUnits,
                    status: availabilityStatus,
                    history: [{
                        previousAvailableUnits: null,
                        availableUnits,
                        reason: reason.trim(),
                        changedBy: req.user._id
                    }]
                });
            }

            await hospital.save();

            res.json({
                success: true,
                message: "Hospital inventory updated successfully.",
                inventory: hospital.inventory
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to update inventory.",
                error: error.message
            });
        }
    }
);

// HOSPITAL UPDATES REQUEST STATUS
router.patch(
    "/hospital/requests/:id/status",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            if (!req.user.approved) {
                return res.status(403).json({
                    success: false,
                    message: "Hospital account is awaiting admin approval."
                });
            }

            const hospital = await getVerifiedHospitalForUser(req.user);

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const allowedStatuses = ["Approved", "Rejected", "Delivered"];
            const { status, reason = "" } = req.body || {};

            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid request status."
                });
            }

            const request = await Request.findOne({
                _id: req.params.id,
                $or: [
                    { "hospitalResponses.hospitalId": hospital._id },
                    { hospitalId: hospital._id, hospitalResponses: { $size: 0 } }
                ]
            });

            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found."
                });
            }

            const response = request.hospitalResponses.find(entry =>
                entry.hospitalId.toString() === hospital._id.toString()
            );

            if (
                status === "Delivered" &&
                response?.status === "Assigned" &&
                request.deliveryPreference === "self" &&
                request.hospitalId?.toString() === hospital._id.toString()
            ) {
                response.status = "Delivered";
                response.respondedAt = new Date();
                updateOverallRequestStatus(request);
                await request.save();
                return res.json({
                    success: true,
                    message: "Patient pickup marked complete.",
                    request
                });
            }

            if (!response || status === "Delivered") {
                return res.status(400).json({
                    success: false,
                    message: "This hospital has no open response for the request."
                });
            }

            if (status === "Rejected" &&
                (typeof reason !== "string" || !reason.trim() || reason.length > 1000)) {
                return res.status(400).json({
                    success: false,
                    message: "A rejection reason of 1,000 characters or fewer is required."
                });
            }
            if (response.status !== "Pending Medical Review") {
                return res.status(409).json({
                    success: false,
                    message: "Verify all submitted documents and complete medical review before recording a final decision."
                });
            }
            if (
                status === "Approved" &&
                (response.clinicalPriority === "needs_review" || !response.priorityReason)
            ) {
                return res.status(409).json({
                    success: false,
                    message: "Record an authorised medical priority assessment and reason before approval."
                });
            }
            response.status = status;
            response.responseReason = status === "Rejected" ? reason.trim() : "";
            response.respondedAt = new Date();
            if (status === "Approved" && !request.hospitalId) {
                request.hospitalId = hospital._id;
                request.sourceHospitalId = hospital._id;
                request.sourceHospital = hospital.name;
                request.sourceLocation = hospital.city;
            }
            updateOverallRequestStatus(request);

            await request.save();

            res.json({
                success: true,
                message: "Request status updated successfully.",
                request,
                hospitalResponse: response
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to update request status.",
                error: error.message
            });
        }
    }
);

router.patch(
    "/patient/requests/:id/delivery",
    authenticate,
    allow("patient"),
    async (req, res) => {
        try {
            const { preference, hospitalId } = req.body || {};
            if (!["self", "delivery"].includes(preference)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose self pickup or hospital delivery."
                });
            }

            const request = await Request.findOne({
                _id: req.params.id,
                patientId: req.user._id
            });

            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found."
                });
            }
            if (request.status !== "Approved" || request.deliveryPreference !== "pending") {
                return res.status(409).json({
                    success: false,
                    message: "The delivery choice is available once after hospital approval."
                });
            }

            const selectedResponse = request.hospitalResponses.find(response =>
                response.hospitalId.toString() === hospitalId &&
                response.status === "Approved"
            );
            if (request.hospitalResponses.length && !selectedResponse) {
                return res.status(409).json({
                    success: false,
                    message: "Choose an approved hospital response before selecting delivery."
                });
            }
            if (selectedResponse) {
                const hospital = await Hospital.findById(selectedResponse.hospitalId)
                    .select("name city");
                request.hospitalId = selectedResponse.hospitalId;
                request.sourceHospitalId = selectedResponse.hospitalId;
                request.sourceHospital = hospital?.name || "";
                request.sourceLocation = hospital?.city || "";
                selectedResponse.deliveryPreference = preference;
                if (preference === "self") selectedResponse.status = "Assigned";
            }
            request.deliveryPreference = preference;
            if (preference === "self") {
                request.status = "Assigned";
            }
            await request.save();

            res.json({
                success: true,
                message: preference === "self"
                    ? "Self pickup selected."
                    : "Hospital delivery selected. The hospital can now assign an approved driver.",
                request
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to save delivery choice."
            });
        }
    }
);

async function getVerifiedHospitalForUser(user) {
    if (!user.approved) return null;
    return Hospital.findOne({ userId: user._id, verified: true });
}

router.get(
    "/hospital/drivers",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const drivers = await User.find({
                role: "driver",
                hospitalId: hospital._id
            }).select("name email phone vehicleNumber vehicleType approved isActive availabilityStatus approvalStatus verificationMethod emailVerified phoneVerified createdAt");

            res.json({ success: true, drivers });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load hospital drivers."
            });
        }
    }
);

router.post(
    "/hospital/drivers",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        let driver;
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const { name, email, phone, vehicleNumber, vehicleType } = req.body || {};
            const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
            const cleanPhone = typeof phone === "string" ? phone.trim() : "";
            if (
                typeof name !== "string" ||
                !name.trim() ||
                name.trim().length > 100 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
                !/^\+[1-9]\d{7,14}$/.test(cleanPhone) ||
                typeof vehicleNumber !== "string" ||
                !vehicleNumber.trim() ||
                vehicleNumber.trim().length > 20 ||
                typeof vehicleType !== "string" ||
                !vehicleType.trim() ||
                vehicleType.trim().length > 60
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Provide the driver's name, valid email and phone, vehicle type, and registration number."
                });
            }
            if (!emailConfigured()) {
                return res.status(503).json({
                    success: false,
                    message: "Email invitations are not configured. Configure email delivery before adding drivers."
                });
            }

            const existing = await User.findOne({
                $or: [{ email: cleanEmail }, { phone: cleanPhone }]
            }).select("_id");
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "A user with that email or phone is already registered."
                });
            }

            const invitationToken = crypto.randomBytes(32).toString("hex");
            const initialPassword = crypto.randomBytes(32).toString("base64url");
            driver = await User.create({
                name: name.trim(),
                email: cleanEmail,
                phone: cleanPhone,
                password: await bcrypt.hash(initialPassword, 12),
                role: "driver",
                vehicleNumber: vehicleNumber.trim().toUpperCase(),
                vehicleType: vehicleType.trim(),
                hospitalId: hospital._id,
                approved: true,
                approvalStatus: "approved",
                verificationMethod: "email",
                emailVerified: true,
                passwordResetHash: crypto.createHash("sha256")
                    .update(invitationToken)
                    .digest("hex"),
                passwordResetExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });

            const baseUrl = process.env.APP_BASE_URL || "http://localhost:5050";
            const invitationUrl = new URL("/", baseUrl);
            invitationUrl.searchParams.set("passwordReset", invitationToken);
            try {
                await sendEmail({
                    to: cleanEmail,
                    subject: "OrganRoute hospital driver account",
                    text: `${hospital.name} created a driver account for you. Set your password within 24 hours: ${invitationUrl.toString()}`
                });
            } catch (error) {
                await User.deleteOne({ _id: driver._id });
                driver = null;
                throw error;
            }

            return res.status(201).json({
                success: true,
                message: "Driver account created. A secure password setup link was emailed to the driver.",
                driver: {
                    id: driver._id,
                    name: driver.name,
                    email: driver.email,
                    phone: driver.phone,
                    vehicleNumber: driver.vehicleNumber,
                    vehicleType: driver.vehicleType,
                    approved: driver.approved,
                    isActive: driver.isActive
                }
            });
        } catch (error) {
            console.error("Hospital driver invitation error:", error.message);
            if (driver) await User.deleteOne({ _id: driver._id });
            res.status(error.code === 11000 ? 409 : 500).json({
                success: false,
                message: error.code === 11000
                    ? "A user with that email or phone is already registered."
                    : "Unable to create and email the driver invitation."
            });
        }
    }
);

router.patch(
    "/hospital/drivers/:id",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }
            if (typeof req.body?.isActive !== "boolean") {
                return res.status(400).json({
                    success: false,
                    message: "Provide an active or inactive driver status."
                });
            }
            const driver = await User.findOneAndUpdate(
                {
                    _id: req.params.id,
                    role: "driver",
                    hospitalId: hospital._id
                },
                { $set: { isActive: req.body.isActive } },
                { new: true, runValidators: true }
            ).select("name email phone vehicleNumber vehicleType approved isActive availabilityStatus");
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: "Driver not found for this hospital."
                });
            }
            res.json({
                success: true,
                message: `Driver ${driver.isActive ? "activated" : "deactivated"}.`,
                driver
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to update driver status."
            });
        }
    }
);

router.patch(
    "/hospital/drivers/:id/approve",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const driver = await User.findOne({
                _id: req.params.id,
                role: "driver",
                hospitalId: hospital._id
            });
            if (!driver) {
                return res.status(404).json({
                    success: false,
                    message: "Driver application not found for this hospital."
                });
            }
            const isContactVerified = driver.verificationMethod === "email"
                ? driver.emailVerified
                : driver.verificationMethod === "phone" && driver.phoneVerified;
            if (!isContactVerified) {
                return res.status(409).json({
                    success: false,
                    message: "The driver's selected email or phone must be verified before approval."
                });
            }

            driver.approved = true;
            driver.approvalStatus = "approved";
            await driver.save();
            res.json({ success: true, message: "Driver approved." });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to approve driver."
            });
        }
    }
);

router.post(
    "/hospital/requests/:id/driver",
    authenticate,
    allow("hospital"),
    async (req, res) => {
        try {
            const hospital = await getVerifiedHospitalForUser(req.user);
            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Verified hospital profile not found."
                });
            }

            const request = await Request.findById(req.params.id);
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found."
                });
            }
            if (
                request.hospitalId?.toString() !== hospital._id.toString() ||
                request.status !== "Approved" ||
                request.deliveryPreference !== "delivery"
            ) {
                return res.status(409).json({
                    success: false,
                    message: "Only approved requests with hospital delivery selected can be assigned."
                });
            }
            const hospitalResponse = request.hospitalResponses.find(response =>
                response.hospitalId.toString() === hospital._id.toString()
            );
            if (
                hospitalResponse &&
                (hospitalResponse.status !== "Approved" ||
                    hospitalResponse.deliveryPreference !== "delivery")
            ) {
                return res.status(409).json({
                    success: false,
                    message: "This hospital response is not approved for delivery assignment."
                });
            }

            const driverId = req.body?.driverId;
            if (typeof driverId !== "string" || !/^[a-fA-F0-9]{24}$/.test(driverId)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose an approved driver registered with this hospital."
                });
            }

            const driver = await User.findOne({
                _id: driverId,
                role: "driver",
                hospitalId: hospital._id,
                approved: true,
                isActive: { $ne: false },
                availabilityStatus: { $ne: "unavailable" },
                $or: [
                    { verificationMethod: "email", emailVerified: true },
                    { verificationMethod: "phone", phoneVerified: true }
                ]
            });
            if (!driver) {
                return res.status(400).json({
                    success: false,
                    message: "Choose an approved driver registered with this hospital."
                });
            }

            const destinationHospitalId = req.body?.recipientHospitalId;
            if (
                typeof destinationHospitalId !== "string" ||
                !/^[a-fA-F0-9]{24}$/.test(destinationHospitalId) ||
                destinationHospitalId === hospital._id.toString()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a different verified receiving hospital with route coordinates."
                });
            }
            const destinationHospital = await Hospital.findOne({
                _id: destinationHospitalId,
                verified: true,
                latitude: { $type: "number" },
                longitude: { $type: "number" }
            });
            if (!destinationHospital) {
                return res.status(400).json({
                    success: false,
                    message: "The receiving hospital must be verified and have route coordinates."
                });
            }

            const activeAssignment = await Request.findOne({
                driverId: driver._id,
                status: { $in: ["Assigned", "In Transit"] }
            });
            if (activeAssignment) {
                return res.status(409).json({
                    success: false,
                    message: "This driver already has an active delivery."
                });
            }

            request.driverId = driver._id;
            request.recipientHospitalId = destinationHospital._id;
            request.recipientHospital = destinationHospital.name;
            request.destinationLocation = destinationHospital.city;
            request.status = "Assigned";
            request.selectedRouteId = "";
            request.shortestRouteId = "";
            request.routeWarning = "";
            request.routeOptions = [];
            request.selectedRoute = { distanceKm: null, durationMinutes: null, geometry: null, steps: [] };
            if (hospitalResponse) {
                hospitalResponse.driverId = driver._id;
                hospitalResponse.recipientHospitalId = destinationHospital._id;
                hospitalResponse.status = "Assigned";
                hospitalResponse.respondedAt = new Date();
            }
            await request.save();

            res.json({ success: true, message: "Approved driver assigned.", request });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to assign driver."
            });
        }
    }
);

router.patch(
    "/driver/availability",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        const status = req.body?.availabilityStatus;
        if (!["available", "unavailable"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Choose available or unavailable."
            });
        }
        req.user.availabilityStatus = status;
        await req.user.save();
        return res.json({
            success: true,
            message: `You are now ${status}.`,
            availabilityStatus: req.user.availabilityStatus
        });
    }
);

router.get(
    "/driver/dashboard",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const requests = await Request.find({ driverId: req.user._id })
                .populate("patientId", "name")
                .populate("hospitalId", "name city latitude longitude")
                .populate("sourceHospitalId", "name city latitude longitude")
                .populate("recipientHospitalId", "name city latitude longitude")
                .select("-routeOptions.geometry")
                .sort({ createdAt: -1 });

            res.json({ success: true, requests });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load driver deliveries."
            });
        }
    }
);

router.get(
    "/driver/requests/:id/routes",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const request = await Request.findOne({
                _id: req.params.id,
                driverId: req.user._id,
                status: "Assigned",
                deliveryPreference: "delivery"
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Assigned delivery not found or no longer available."
                });
            }
            if (!request.sourceHospitalId || !request.recipientHospitalId) {
                return res.status(400).json({
                    success: false,
                    message: "This request is missing route hospital details."
                });
            }

            if (!request.routeOptions.length) {
                const routes = await calculateHospitalRoute(
                    request.sourceHospitalId.toString(),
                    request.recipientHospitalId.toString()
                );
                request.routeOptions = routes.routeOptions.map(route => ({
                    id: route.id,
                    name: route.name,
                    distanceKm: route.distanceKm,
                    durationMinutes: route.durationMinutes,
                    geometry: route.geometry,
                    steps: route.steps
                }));
                request.shortestRouteId = routes.shortestRouteId;
                request.routeWarning = routes.warning || "";
                await request.save();
            }
            res.json({
                success: true,
                routeOptions: request.routeOptions,
                shortestRouteId: request.shortestRouteId,
                warning: request.routeWarning
            });
        } catch (error) {
            res.status(502).json({
                success: false,
                message: `Unable to calculate routes: ${error.message}`
            });
        }
    }
);

router.post(
    "/driver/requests/:id/route",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const { routeId } = req.body || {};
            const request = await Request.findOne({
                _id: req.params.id,
                driverId: req.user._id,
                status: "Assigned",
                deliveryPreference: "delivery"
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Assigned delivery not found or no longer available."
                });
            }

            const selected = request.routeOptions.find(route => route.id === routeId);
            if (!selected) {
                return res.status(400).json({
                    success: false,
                    message: "Choose one of the currently available route options."
                });
            }

            request.selectedRouteId = selected.id;
            request.selectedRoute = {
                distanceKm: selected.distanceKm,
                durationMinutes: selected.durationMinutes,
                geometry: selected.geometry,
                steps: selected.steps
            };
            await request.save();
            res.json({ success: true, message: "Route selected." });
        } catch (error) {
            res.status(502).json({
                success: false,
                message: `Unable to save route choice: ${error.message}`
            });
        }
    }
);

function validCoordinates(latitude, longitude) {
    return typeof latitude === "number" &&
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        typeof longitude === "number" &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180;
}

router.post(
    "/driver/requests/:id/start",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const { latitude, longitude } = req.body || {};
            if (!validCoordinates(latitude, longitude)) {
                return res.status(400).json({
                    success: false,
                    message: "A valid GPS location is required to start sharing."
                });
            }
            const request = await Request.findOne({
                _id: req.params.id,
                driverId: req.user._id,
                status: "Assigned",
                deliveryPreference: "delivery"
            });
            if (!request || !request.selectedRouteId) {
                return res.status(409).json({
                    success: false,
                    message: "Select a route before starting this delivery."
                });
            }

            request.status = "In Transit";
            request.deliveryStartedAt = new Date();
            request.driverLocation = { latitude, longitude, updatedAt: new Date() };
            const response = request.hospitalResponses.find(entry =>
                entry.hospitalId.toString() === request.hospitalId?.toString()
            );
            if (response) response.status = "In Transit";
            updateOverallRequestStatus(request);
            await request.save();
            res.json({ success: true, message: "Delivery started. Location sharing is active." });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to start delivery."
            });
        }
    }
);

router.post(
    "/driver/requests/:id/location",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const { latitude, longitude } = req.body || {};
            if (!validCoordinates(latitude, longitude)) {
                return res.status(400).json({
                    success: false,
                    message: "Provide valid GPS coordinates."
                });
            }
            const request = await Request.findOne({
                _id: req.params.id,
                driverId: req.user._id,
                status: "In Transit"
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Active delivery not found."
                });
            }
            request.driverLocation = { latitude, longitude, updatedAt: new Date() };
            await request.save();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to update delivery location."
            });
        }
    }
);

router.patch(
    "/driver/requests/:id/delivered",
    authenticate,
    allow("driver"),
    requireApprovedDriver,
    async (req, res) => {
        try {
            const request = await Request.findOne({
                _id: req.params.id,
                driverId: req.user._id,
                status: "In Transit"
            });
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Active delivery not found."
                });
            }
            request.status = "Delivered";
            request.driverLocation = { latitude: null, longitude: null, updatedAt: null };
            const response = request.hospitalResponses.find(entry =>
                entry.hospitalId.toString() === request.hospitalId?.toString()
            );
            if (response) response.status = "Delivered";
            updateOverallRequestStatus(request);
            await request.save();
            res.json({ success: true, message: "Delivery marked complete." });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to complete delivery."
            });
        }
    }
);

router.get(
    "/requests/:id/tracking",
    authenticate,
    allow("patient", "hospital"),
    async (req, res) => {
        try {
            const request = await Request.findById(req.params.id)
                .populate("driverId", "name phone vehicleNumber");
            if (!request) {
                return res.status(404).json({
                    success: false,
                    message: "Request not found."
                });
            }
            if (req.user.role === "patient" && request.patientId.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: "You cannot view another patient's delivery."
                });
            }
            if (req.user.role === "hospital") {
                const hospital = await getVerifiedHospitalForUser(req.user);
                if (!hospital || request.hospitalId?.toString() !== hospital._id.toString()) {
                    return res.status(403).json({
                        success: false,
                        message: "This delivery is not assigned to your hospital."
                    });
                }
            }
            if (!request.driverId || request.deliveryPreference !== "delivery") {
                return res.status(409).json({
                    success: false,
                    message: "A hospital-delivery driver has not been assigned."
                });
            }
            if (request.status !== "In Transit") {
                return res.status(409).json({
                    success: false,
                    message: "Driver details and route are available after the driver starts the delivery."
                });
            }

            res.json({
                success: true,
                status: request.status,
                driver: {
                    name: request.driverId.name,
                    phone: request.driverId.phone,
                    vehicleNumber: request.driverId.vehicleNumber
                },
                route: {
                    id: request.selectedRouteId,
                    distanceKm: request.selectedRoute.distanceKm,
                    durationMinutes: request.selectedRoute.durationMinutes,
                    geometry: request.selectedRoute.geometry
                },
                updatedAt: request.driverLocation.updatedAt,
                location: request.driverLocation
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Unable to load delivery tracking."
            });
        }
    }
);

module.exports = router;
