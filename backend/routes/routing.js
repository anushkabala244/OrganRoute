const express = require("express");
const router = express.Router();

const {
    getRoutingHospitals,
    calculateHospitalRoute
} = require("../services/routingService");

router.get("/hospitals", async (req, res) => {
    try {
        const hospitals = await getRoutingHospitals();

        const formattedHospitals = hospitals.map(hospital => ({
            id: hospital._id.toString(),
            name: hospital.name,
            city: hospital.city,
            state: hospital.state,
            latitude: hospital.latitude,
            longitude: hospital.longitude,
            verified: Boolean(hospital.verified),
            isDemo: Boolean(hospital.isDemo)
        }));

        return res.json({
            success: true,
            count: formattedHospitals.length,
            hospitals: formattedHospitals
        });
    } catch (error) {
        console.error("Hospital fetch error:", error);

        return res.status(500).json({
            success: false,
            message: error.message || "Unable to load hospitals."
        });
    }
});

router.post("/route", async (req, res) => {
    try {
        const { sourceHospitalId, recipientHospitalId } = req.body || {};

        if (!sourceHospitalId || !recipientHospitalId) {
            return res.status(400).json({
                success: false,
                message: "Source and destination hospital IDs are required."
            });
        }

        const routeData = await calculateHospitalRoute(
            sourceHospitalId,
            recipientHospitalId
        );

        return res.json(routeData);
    } catch (error) {
        console.error("Route calculation error:", error);

        return res.status(400).json({
            success: false,
            message: error.message || "Route calculation failed."
        });
    }
});

module.exports = router;
