const assert = require("node:assert/strict");
const { test } = require("node:test");
const demoHospitals = require("../data/demoHospitals");

test("seed hospital records remain explicitly fictional and unverified", () => {
    assert.ok(demoHospitals.length >= 5);
    assert.ok(demoHospitals.every(hospital => hospital.isDemo === true));
    assert.ok(demoHospitals.every(hospital => hospital.verified === false));
});
