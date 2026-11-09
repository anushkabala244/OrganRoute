const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");
const authRoutes = require("../routes/auth");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const geocodingService = require("../services/geocodingService");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
    await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
    );
});

test("public registration rejects driver accounts before creating a user", async () => {
    const response = await fetch(`${baseUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "driver" })
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.match(result.message, /patient and hospital accounts only/i);
});

test("public login rejects driver and platform administrator roles", async () => {
    for (const role of ["driver", "admin"]) {
        const response = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "person@example.test", password: "example-password", role })
        });
        const result = await response.json();

        assert.equal(response.status, 400);
        assert.match(result.message, /designated sign-in route/i);
    }
});

test("hospital registration stores address fields and ignores client coordinates", async () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        DEV_OTP_MODE: process.env.DEV_OTP_MODE
    };
    const originalUserMethods = {
        findOne: User.findOne,
        create: User.create
    };
    const originalHospitalCreate = Hospital.create;
    const originalGeocodeAddress = geocodingService.geocodeAddress;
    let hospitalData;

    process.env.NODE_ENV = "development";
    process.env.DEV_OTP_MODE = "true";
    User.findOne = async () => null;
    User.create = async data => ({
        ...data,
        _id: "test-user-id",
        save: async () => {}
    });
    Hospital.create = async data => {
        hospitalData = data;
        return { _id: "test-hospital-id" };
    };
    geocodingService.geocodeAddress = async () => ({
        latitude: 28.6139,
        longitude: 77.2090
    });

    try {
        const response = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                role: "hospital",
                name: "Hospital Administrator",
                email: "admin@example.test",
                phone: "+919876543210",
                password: "example-password",
                verificationMethod: "email",
                hospitalName: "Example Hospital",
                address: "10 Example Road",
                country: "India",
                city: "Delhi",
                state: "Delhi",
                postalCode: "110001",
                registrationNumber: "REG-123",
                latitude: 0,
                longitude: 0
            })
        });

        assert.equal(response.status, 201);
        assert.equal(hospitalData.country, "India");
        assert.equal(hospitalData.city, "Delhi");
        assert.equal(hospitalData.state, "Delhi");
        assert.equal(hospitalData.postalCode, "110001");
        assert.equal(hospitalData.latitude, 28.6139);
        assert.equal(hospitalData.longitude, 77.2090);
    } finally {
        User.findOne = originalUserMethods.findOne;
        User.create = originalUserMethods.create;
        Hospital.create = originalHospitalCreate;
        geocodingService.geocodeAddress = originalGeocodeAddress;
        if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnv.NODE_ENV;
        if (originalEnv.DEV_OTP_MODE === undefined) delete process.env.DEV_OTP_MODE;
        else process.env.DEV_OTP_MODE = originalEnv.DEV_OTP_MODE;
    }
});

test("development password reset retains driver and admin sign-in roles", async () => {
    const originalEnv = {
        NODE_ENV: process.env.NODE_ENV,
        DEV_PASSWORD_RESET_MODE: process.env.DEV_PASSWORD_RESET_MODE
    };
    const originalFindOne = User.findOne;
    process.env.NODE_ENV = "development";
    process.env.DEV_PASSWORD_RESET_MODE = "true";
    User.findOne = async () => null;

    try {
        for (const role of ["driver", "admin"]) {
            const response = await fetch(`${baseUrl}/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "person@example.test",
                    role
                })
            });
            const result = await response.json();

            assert.equal(response.status, 200);
            assert.equal(new URL(result.developmentResetUrl).searchParams.get("role"), role);
        }
    } finally {
        User.findOne = originalFindOne;
        if (originalEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalEnv.NODE_ENV;
        if (originalEnv.DEV_PASSWORD_RESET_MODE === undefined) {
            delete process.env.DEV_PASSWORD_RESET_MODE;
        } else {
            process.env.DEV_PASSWORD_RESET_MODE = originalEnv.DEV_PASSWORD_RESET_MODE;
        }
    }
});
