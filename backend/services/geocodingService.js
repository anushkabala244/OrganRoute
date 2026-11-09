const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function geocodeAddress({ address = "", city = "", state = "", postalCode = "", country = "" }) {
    const query = [address, city, state, postalCode, country]
        .map(value => String(value).trim())
        .filter(Boolean)
        .join(", ");

    if (!query) {
        throw new Error("A hospital address is required for geocoding.");
    }

    const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "1"
    });
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: {
            "User-Agent": "OrganRoute/1.0"
        },
        signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
        throw new Error(`Hospital address lookup failed: ${response.status}`);
    }

    const results = await response.json();
    if (!Array.isArray(results)) {
        throw new Error("Hospital address lookup returned an invalid response.");
    }
    if (!results.length) return null;

    const latitude = Number(results[0].lat);
    const longitude = Number(results[0].lon);
    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        throw new Error("Hospital address lookup returned invalid coordinates.");
    }

    return { latitude, longitude };
}

module.exports = { geocodeAddress };
