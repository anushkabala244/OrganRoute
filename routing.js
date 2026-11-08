const API_URL = "/api/routing";

const sourceSelect = document.getElementById("sourceHospital");
const destinationSelect = document.getElementById("recipientHospital");
const findRouteBtn = document.getElementById("findRouteBtn");
const statusMessage = document.getElementById("statusMessage");
const routeResults = document.getElementById("routeResults");
const routeOptionsSection = document.getElementById("routeOptions");
const routeOptionList = document.getElementById("routeOptionList");
const demoWarning = document.getElementById("demoWarning");
const distanceValue = document.getElementById("distanceValue");
const timeValue = document.getElementById("timeValue");
const hospitalCount = document.getElementById("hospitalCount");
const hospitalPathContainer = document.getElementById("hospitalPath");

const map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    touchZoom: true,
    dragging: true,
    boxZoom: true,
    keyboard: true,
    zoomSnap: 0.5,
    zoomDelta: 0.5
}).setView([28.6139, 77.2090], 10);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
}).addTo(map);

let routeLayer = null;
let routeMarkers = [];
let currentRouteOptions = [];

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? "#b42318" : "#667085";
}

async function loadHospitals() {
    try {
        showStatus("Loading hospitals…");
        const response = await fetch(`${API_URL}/hospitals`);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load hospitals.");
        }

        sourceSelect.innerHTML = '<option value="">Select source hospital</option>';
        destinationSelect.innerHTML = '<option value="">Select destination hospital</option>';
        data.hospitals.forEach((hospital) => {
            const label = `${hospital.name} — ${hospital.city}`;
            for (const select of [sourceSelect, destinationSelect]) {
                const option = document.createElement("option");
                option.value = hospital.id;
                option.textContent = label;
                select.appendChild(option);
            }
        });

        showStatus(`${data.count} hospitals loaded.`);
    } catch (error) {
        showStatus(error.message, true);
        console.error("Hospital loading failed:", error);
    }
}

function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];
    currentRouteOptions = [];
    routeResults.classList.add("hidden");
    routeOptionsSection.classList.add("hidden");
    routeOptionList.replaceChildren();
    demoWarning.classList.add("hidden");
    hospitalPathContainer.textContent = "Select hospitals to view the route.";
}

function renderRouteOptions(data) {
    currentRouteOptions = data.routeOptions || [];
    routeOptionList.replaceChildren();
    if (currentRouteOptions.length === 0) {
        throw new Error("No road route options are available.");
    }

    currentRouteOptions.forEach((route) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "route-option";
        button.setAttribute("aria-pressed", "false");

        const routeTitle = document.createElement("strong");
        routeTitle.textContent = route.name;
        const details = document.createElement("span");
        details.textContent = `${route.distanceKm} km · ${route.durationMinutes} min`;
        button.append(routeTitle, details);

        const badges = [];
        if (route.id === data.fastestRouteId) badges.push("Fastest");
        if (route.id === data.shortestRouteId) badges.push("Shortest");
        if (badges.length) {
            const badge = document.createElement("small");
            badge.textContent = badges.join(" · ");
            button.appendChild(badge);
        }

        button.addEventListener("click", () => selectRoute(route, data));
        routeOptionList.appendChild(button);
    });

    routeOptionsSection.classList.remove("hidden");
}

function selectRoute(route, data) {
    const coordinates = route.geometry?.coordinates?.map(point => [point[1], point[0]]);
    if (!coordinates || coordinates.length < 2) {
        showStatus("Route coordinates are unavailable.", true);
        return;
    }

    if (routeLayer) map.removeLayer(routeLayer);
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];

    distanceValue.textContent = `${route.distanceKm} km`;
    timeValue.textContent = `${route.durationMinutes} min`;
    hospitalCount.textContent = String(data.hospitalPath.length);
    routeResults.classList.remove("hidden");

    routeLayer = L.polyline(coordinates, {
        color: "#0d9b7b",
        weight: 6,
        opacity: 0.9
    }).addTo(map);

    const sourcePopup = document.createElement("span");
    sourcePopup.textContent = `START — ${data.sourceHospital.name}`;
    const destinationPopup = document.createElement("span");
    destinationPopup.textContent = `DESTINATION — ${data.recipientHospital.name}`;

    const sourceMarker = L.marker(coordinates[0]).addTo(map).bindPopup(sourcePopup);
    const destinationMarker = L.marker(coordinates[coordinates.length - 1])
        .addTo(map)
        .bindPopup(destinationPopup);
    routeMarkers.push(sourceMarker, destinationMarker);

    map.fitBounds(routeLayer.getBounds(), {
        padding: [45, 45],
        maxZoom: 13,
        animate: true
    });

    routeOptionList.querySelectorAll(".route-option").forEach((button, index) => {
        const selected = currentRouteOptions[index]?.id === route.id;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    hospitalPathContainer.replaceChildren();
    data.hospitalPath.forEach((hospital, index) => {
        const item = document.createElement("div");
        item.className = "path-item";
        item.textContent = `${index + 1}. ${hospital.name} (${hospital.city})`;
        hospitalPathContainer.appendChild(item);
    });

    if (data.demoMode && data.warning) {
        demoWarning.textContent = data.warning;
        demoWarning.classList.remove("hidden");
    } else {
        demoWarning.classList.add("hidden");
    }

    showStatus(`${route.name} selected. Route estimates are informational only.`);
}

async function findFastestRoute() {
    const sourceHospitalId = sourceSelect.value;
    const recipientHospitalId = destinationSelect.value;

    if (!sourceHospitalId || !recipientHospitalId) {
        showStatus("Please select both hospitals.", true);
        return;
    }
    if (sourceHospitalId === recipientHospitalId) {
        showStatus("Select two different hospitals.", true);
        return;
    }

    clearRoute();
    findRouteBtn.disabled = true;
    findRouteBtn.textContent = "Calculating route…";
    showStatus("Finding road routes…");

    try {
        const response = await fetch(`${API_URL}/route`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceHospitalId, recipientHospitalId })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Route calculation failed.");
        }
        if (!Array.isArray(data.hospitalPath) || data.hospitalPath.length < 2) {
            throw new Error("The hospital network route is unavailable.");
        }

        renderRouteOptions(data);
        const defaultRoute = currentRouteOptions.find(
            route => route.id === data.fastestRouteId
        ) || currentRouteOptions[0];
        selectRoute(defaultRoute, data);
    } catch (error) {
        showStatus(error.message, true);
        console.error("Routing error:", error);
    } finally {
        findRouteBtn.disabled = false;
        findRouteBtn.textContent = "Find Fastest Route";
    }
}

findRouteBtn.addEventListener("click", findFastestRoute);
loadHospitals();
