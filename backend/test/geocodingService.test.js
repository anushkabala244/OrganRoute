const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { geocodeAddress } = require("../services/geocodingService");

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

test("geocodes a hospital address using the existing location details", async () => {
    let requestUrl;
    let requestHeaders;
    global.fetch = async (url, options) => {
        requestUrl = new URL(url);
        requestHeaders = options.headers;
        return {
            ok: true,
            json: async () => [{ lat: "28.6139", lon: "77.2090" }]
        };
    };

    const coordinates = await geocodeAddress({
        address: "10 Example Road",
        city: "Delhi",
        state: "Delhi",
        postalCode: "110001",
        country: "India"
    });

    assert.equal(requestUrl.searchParams.get("q"), "10 Example Road, Delhi, Delhi, 110001, India");
    assert.equal(requestHeaders["User-Agent"], "OrganRoute/1.0");
    assert.deepEqual(coordinates, { latitude: 28.6139, longitude: 77.2090 });
});

test("returns null when the geocoder has no matching result", async () => {
    global.fetch = async () => ({
        ok: true,
        json: async () => []
    });

    assert.equal(await geocodeAddress({ city: "Unknown", country: "India" }), null);
});

test("rejects malformed or out-of-range geocoder coordinates", async () => {
    global.fetch = async () => ({
        ok: true,
        json: async () => [{ lat: "91", lon: "77" }]
    });

    await assert.rejects(
        geocodeAddress({ city: "Delhi", country: "India" }),
        /invalid coordinates/i
    );
});
