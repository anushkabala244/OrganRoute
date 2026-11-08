const token = localStorage.getItem("organroute.token");
const content = document.getElementById("dashboard-content");
const notice = document.getElementById("workspace-notice");
const nav = document.getElementById("dashboard-nav");
let currentUser = null;
let currentRole = null;
let driverWatchId = null;
let lastLocationSentAt = 0;
let driverMap = null;
let driverMapMarker = null;
const trackingIntervals = [];
const trackingMaps = new Map();
const trackingMarkers = new Map();
const trackingRouteLayers = new Map();

const navigation = {
    patient: [
        ["overview", "Overview"],
        ["requests", "My requests"],
        ["new-request", "New request"]
    ],
    hospital: [
        ["overview", "Overview"],
        ["requests", "Requests"],
        ["inventory", "Inventory"],
        ["drivers", "Drivers"]
    ],
    driver: [
        ["deliveries", "My deliveries"]
    ],
    admin: [
        ["overview", "Overview"],
        ["applications", "Hospital approvals"]
    ]
};

document.getElementById("logout-button").addEventListener("click", () => {
    stopDriverLocationSharing();
    cleanupTrackingMaps();
    trackingIntervals.splice(0).forEach(interval => window.clearInterval(interval));
    localStorage.removeItem("organroute.token");
    localStorage.removeItem("organroute.user");
    window.location.assign("../index.html");
});

if (!token) {
    window.location.replace("../index.html");
} else {
    initialiseWorkspace();
}

async function previewRequestDocument(button) {
    button.disabled = true;
    try {
        const response = await fetch(
            `/api/hospital/requests/${encodeURIComponent(button.dataset.previewDocument)}/documents/${encodeURIComponent(button.dataset.documentId)}`,
            { headers: { Authorization: "Bearer " + token } }
        );
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Document preview failed (${response.status}).`);
        }
        const url = URL.createObjectURL(await response.blob());
        const preview = document.createElement("dialog");
        preview.className = "document-preview-dialog";
        preview.innerHTML = `
            <div class="panel-header"><strong>${escapeHtml(button.dataset.fileName || "Document preview")}</strong><button class="button button-quiet" type="button" data-close-preview>Close</button></div>
            <iframe title="Private document preview" src="${url}"></iframe>`;
        document.body.appendChild(preview);
        preview.querySelector("[data-close-preview]").addEventListener("click", () => {
            preview.close();
            preview.remove();
            URL.revokeObjectURL(url);
        });
        preview.addEventListener("close", () => {
            preview.remove();
            URL.revokeObjectURL(url);
        }, { once: true });
        preview.showModal();
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        button.disabled = false;
    }
}

async function initialiseWorkspace() {
    try {
        const result = await api("/api/me");
        currentUser = result.user;
        currentRole = currentUser.role;
        if (!navigation[currentRole]) {
            throw new Error("This account does not have a supported workspace.");
        }

        document.getElementById("workspace-role").textContent =
            `${currentRole.toUpperCase()} WORKSPACE`;
        document.getElementById("workspace-title").textContent =
            `${greeting()}, ${currentUser.name.split(" ")[0]}`;
        document.getElementById("user-name").textContent = currentUser.name;
        document.getElementById("user-avatar").textContent =
            currentUser.name.trim().charAt(0).toUpperCase();
        renderNavigation();

        await openView(currentRole === "driver" ? "deliveries" : "overview");
    } catch (error) {
        content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
        if (/token|account/i.test(error.message)) {
            localStorage.removeItem("organroute.token");
            localStorage.removeItem("organroute.user");
            window.setTimeout(() => window.location.replace("../index.html"), 1200);
        }
    }
}

function greeting() {
    const hour = new Date().getHours();
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function renderNavigation() {
    const items = currentRole === "hospital" && !currentUser.approved
        ? [["overview", "Account review"]]
        : navigation[currentRole];
    nav.innerHTML = items.map(([view, label], index) => `
        <button type="button" class="nav-item${index === 0 ? " active" : ""}" data-view="${view}">
            ${label}
        </button>
    `).join("");
    nav.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => openView(button.dataset.view));
    });
}

async function openView(view) {
    cleanupTrackingMaps();
    nav.querySelectorAll(".nav-item").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === view);
    });
    hideNotice();
    content.innerHTML = `<div class="loading-state">Loading your workspace…</div>`;

    try {
        trackingIntervals.splice(0).forEach(interval => window.clearInterval(interval));
        if (view === "overview") await renderOverview();
        else if (view === "requests") await renderRequests();
        else if (view === "new-request") await renderNewRequest();
        else if (view === "inventory") await renderInventory();
        else if (view === "drivers") await renderDrivers();
        else if (view === "deliveries") await renderDeliveries();
        else if (view === "applications") await renderApplications();
    } catch (error) {
        showNotice(error.message, true);
        content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

async function renderOverview() {
    if (currentRole === "driver") {
        await renderDeliveries();
        return;
    }

    if (currentRole === "admin") {
        const result = await api("/api/admin/hospitals/pending");
        content.innerHTML = `
            ${intro("Administration", "Review hospital applications before allowing access to protected hospital tools.")}
            ${metrics([["Pending approvals", result.total], ["Account role", "Admin"], ["Platform", "Demo"]])}
            <section class="panel">
                <div class="panel-header"><h2>Hospital applications</h2><button class="button button-quiet" data-go="applications">Review applications</button></div>
                ${result.total ? `<p class="panel-description">${result.total} hospital application(s) are waiting for review.</p>` : `<div class="empty-state">No hospital applications are pending.</div>`}
            </section>`;
        content.querySelector("[data-go]").addEventListener("click", () => openView("applications"));
        return;
    }

    if (currentRole === "hospital" && !currentUser.approved) {
        const rejected = currentUser.approvalStatus === "rejected";
        content.innerHTML = `
            ${intro("Hospital account review", rejected ? "Your application was not approved." : "Your application is being reviewed.")}
            <section class="panel">
                <h2>${rejected ? "Contact the platform administrator" : "Tools unlock after approval"}</h2>
                <p class="panel-description">${rejected
                    ? "Please contact the platform administrator for information about the decision and next steps."
                    : "Hospital requests and inventory remain unavailable until an administrator approves and verifies the hospital profile."}</p>
            </section>`;
        showNotice(
            rejected
                ? "Your hospital application was not approved."
                : "Your hospital account is awaiting administrator approval.",
            rejected
        );
        return;
    }

    const endpoint = currentRole === "patient"
        ? "/api/patient/dashboard"
        : "/api/hospital/dashboard";
    const result = await api(endpoint);

    if (currentRole === "patient") {
        const requests = result.requests || [];
        content.innerHTML = `
            ${intro("Your coordination overview", "Keep track of requests and use the hospital network tools from one place.")}
            ${demoBanner()}
            ${metrics([["Total requests", result.totalRequests], ["Pending", countStatus(requests, "Pending")], ["In progress", requests.filter(item => ["Approved", "Assigned", "In Transit"].includes(item.status)).length], ["Completed", countStatus(requests, "Delivered")]])}
            ${requestTable(requests.slice(0, 5), "Recent requests")}
        `;
        attachPatientRequestActions();
        attachTrackingUpdates(requests);
    } else {
        const requests = result.requests || [];
        const hospital = result.hospital;
        const drivers = (await api("/api/hospital/drivers")).drivers || [];
        content.innerHTML = `
            ${intro("Hospital coordination", "Review incoming requests and maintain the hospital profile's demo inventory.")}
            ${demoBanner()}
            ${metrics([["Requests", result.totalRequests], ["Pending", countStatus(requests, "Pending")], ["In progress", requests.filter(item => ["Approved", "Assigned", "In Transit"].includes(item.status)).length], ["Inventory items", (hospital.inventory || []).length]])}
            <section class="panel">
                <h2>${escapeHtml(hospital.name)}</h2>
                <p class="panel-description">${escapeHtml(hospital.city)}, ${escapeHtml(hospital.state)} · ${hospital.verified ? "Verified" : "Not verified"}</p>
            </section>
            ${requestTable(requests.slice(0, 5), "Recent requests", true, drivers, result.routeDestinations || [])}
            <section class="panel">
                <div class="panel-header"><h2>Manage inventory</h2><button class="button button-quiet" data-go="inventory">Update demo inventory</button></div>
                <p class="panel-description">Inventory is illustrative only and must not be used for real organ allocation or clinical decisions.</p>
            </section>`;
        attachHospitalRequestActions();
        attachTrackingUpdates(requests);
        content.querySelector("[data-go]").addEventListener("click", () => openView("inventory"));
    }
}

async function renderRequests() {
    const endpoint = currentRole === "patient" ? "/api/patient/dashboard" : "/api/hospital/dashboard";
    const result = await api(endpoint);
    const requests = result.requests || [];
    const drivers = currentRole === "hospital"
        ? (await api("/api/hospital/drivers")).drivers || []
        : [];
    const destinations = currentRole === "hospital" ? result.routeDestinations || [] : [];
    cleanupTrackingMaps();
    content.innerHTML = `
        ${intro(currentRole === "patient" ? "My requests" : "Incoming requests", currentRole === "patient" ? "Review the latest status of your submitted requests." : "Review unassigned requests and update their coordination status.")}
        ${demoBanner()}
        ${requestTable(requests, currentRole === "patient" ? "Request history" : "Request queue", currentRole === "hospital", drivers, destinations)}`;
    if (currentRole === "hospital") attachHospitalRequestActions();
    else attachPatientRequestActions();
    attachTrackingUpdates(requests);
}

async function renderNewRequest() {
    content.innerHTML = `
        ${intro("Request an organ review", "Choose an organ and submit one request. It is securely shared with every verified hospital currently reporting availability; you do not select a hospital.")}
        ${demoBanner()}
        <section class="panel medical-documents-panel">
            <div class="panel-header">
                <h2>My Medical Documents · Download Sample Documents</h2>
                <span class="fictional-label">FICTIONAL DEMO FILES ONLY</span>
            </div>
            <p class="panel-description">Use the clearly watermarked sample PDFs below to test the private document workflow. They contain invented data only and are not valid for medical use.</p>
        </section>
        <section class="panel">
            <form id="request-form" enctype="multipart/form-data">
                <input type="hidden" name="demoSampleIds" value="[]">
                <div class="form-grid">
                    <div class="field">
                        <label for="organ-type">Organ type</label>
                        <select id="organ-type" name="organType" required>
                            <option value="">Select an organ</option>
                            ${["Kidney", "Liver", "Heart", "Lungs", "Pancreas", "Intestine"].map(item => `<option>${item}</option>`).join("")}
                        </select>
                    </div>
                    <div class="field field-full">
                        <label>Verified hospital availability</label>
                        <div class="availability-list" id="available-hospitals">
                            <p class="panel-description">Select an organ to check hospital listings.</p>
                        </div>
                    </div>
                    <div class="field field-full">
                        <label for="sample-patient">Download Sample Documents</label>
                        <p class="panel-description">Every sample is fictional and watermarked on every page. Samples are for interface testing only and must never be used for medical decisions.</p>
                        <select id="sample-patient">
                            <option value="">Loading fictional profiles…</option>
                        </select>
                        <div id="sample-documents" class="sample-document-list">
                            <p class="panel-description">Loading protected sample documents…</p>
                        </div>
                        <div id="sample-preview" class="sample-preview" hidden></div>
                    </div>
                    <div class="field field-full">
                        <label for="request-documents">My Medical Documents · Upload PDF, JPG or PNG</label>
                        <input id="request-documents" name="documents" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple required>
                        <p class="panel-description">Upload up to five files, 5 MB each. Use fictional test data only. Selected sample files will be sent through the same private upload path as your own test files.</p>
                        <div id="selected-documents" class="selected-document-list" aria-live="polite"></div>
                        <progress id="request-upload-progress" max="100" value="0" hidden></progress>
                        <span id="request-upload-progress-label" class="panel-description" aria-live="polite"></span>
                    </div>
                    <div class="field field-full">
                        <label for="request-notes">Coordination note (optional)</label>
                        <textarea id="request-notes" name="notes" maxlength="1000" placeholder="Do not include additional sensitive medical details here."></textarea>
                    </div>
                </div>
                <div class="form-actions"><button class="button button-primary" type="submit">Send private request</button></div>
            </form>
        </section>`;

    const form = content.querySelector("#request-form");
    const organSelect = form.elements.namedItem("organType");
    const hospitalResults = content.querySelector("#available-hospitals");
    const samplePatient = content.querySelector("#sample-patient");
    const sampleDocuments = content.querySelector("#sample-documents");
    const demoSampleIds = form.elements.namedItem("demoSampleIds");
    const documentInput = form.elements.namedItem("documents");
    const selectedDocuments = content.querySelector("#selected-documents");
    let documentProfiles = [];
    let currentSampleIds = [];

    try {
        const catalog = await api("/api/patient/demo-documents");
        documentProfiles = catalog.profiles || [];
        samplePatient.replaceChildren(new Option("Choose a fictional demo patient", ""));
        documentProfiles.forEach(profile => {
            samplePatient.add(new Option(
                `${profile.name} · ${profile.reference} · fictional`,
                profile.id
            ));
        });
        if (documentProfiles.length) {
            samplePatient.value = documentProfiles[0].id;
            renderSampleDocumentList();
        }
    } catch (error) {
        samplePatient.replaceChildren(new Option("Sample documents unavailable", ""));
        sampleDocuments.innerHTML = `<p class="security-note">${escapeHtml(error.message)}</p>`;
    }

    function renderSampleDocumentList() {
        const profile = documentProfiles.find(item => item.id === samplePatient.value);
        sampleDocuments.innerHTML = profile
            ? `<p class="security-note"><strong>FICTIONAL PROFILE:</strong> ${escapeHtml(profile.name)} (${escapeHtml(profile.reference)}). Every sample is marked “DEMO DOCUMENT – FICTIONAL DATA – NOT VALID FOR MEDICAL USE”.</p>
               ${profile.documents.map(document => `
                 <article class="sample-document-card">
                    <span><strong>${escapeHtml(document.label)}</strong><small>${escapeHtml(profile.name)} · PDF · synthetic</small></span>
                    <div>
                        <button class="button button-quiet" type="button" data-download-sample="${escapeHtml(document.id)}">Download sample</button>
                        <button class="button button-quiet" type="button" data-preview-sample="${escapeHtml(document.id)}">Preview</button>
                        <button class="button button-primary" type="button" data-upload-sample="${escapeHtml(document.id)}">Add to upload</button>
                    </div>
                 </article>
               `).join("")}`
            : `<p class="panel-description">Choose a fictional profile to view its sample PDFs.</p>`;
        sampleDocuments.querySelectorAll("[data-preview-sample]").forEach(button => {
            button.addEventListener("click", () => previewSampleDocument(button));
        });
        sampleDocuments.querySelectorAll("[data-download-sample]").forEach(button => {
            button.addEventListener("click", () => downloadSampleDocument(button));
        });
        sampleDocuments.querySelectorAll("[data-upload-sample]").forEach(button => {
            button.addEventListener("click", () => addSampleDocument(button));
        });
    }

    samplePatient.addEventListener("change", renderSampleDocumentList);
    documentInput.addEventListener("change", () => {
        const selectedNames = new Set(Array.from(documentInput.files || []).map(file => file.name));
        currentSampleIds = currentSampleIds.filter(id =>
            documentProfiles.some(profile =>
                profile.documents.some(sample =>
                    sample.id === id && selectedNames.has(sample.fileName)
                )
            )
        );
        demoSampleIds.value = JSON.stringify(currentSampleIds);
        renderSelectedDocuments();
    });
    renderSelectedDocuments();

    function renderSelectedDocuments() {
        const files = Array.from(documentInput.files || []);
        selectedDocuments.innerHTML = files.length
            ? `<ul>${files.map((file, index) => `<li>${escapeHtml(file.name)} · ${(file.size / 1024).toFixed(0)} KB${file.name.endsWith(".pdf") && currentSampleIds.some(id => documentProfiles.some(profile => profile.documents.some(doc => doc.id === id && doc.fileName === file.name))) ? " · fictional sample" : ""}
                <button class="text-button" type="button" data-remove-document="${index}">Remove before submission</button></li>`).join("")}</ul>`
            : `<p class="panel-description">No files selected yet.</p>`;
        selectedDocuments.querySelectorAll("[data-remove-document]").forEach(button => {
            button.addEventListener("click", () => {
                const transfer = new DataTransfer();
                Array.from(documentInput.files || []).forEach((file, index) => {
                    if (index !== Number(button.dataset.removeDocument)) transfer.items.add(file);
                });
                documentInput.files = transfer.files;
                const selectedNames = new Set(Array.from(transfer.files).map(file => file.name));
                currentSampleIds = currentSampleIds.filter(id =>
                    documentProfiles.some(profile =>
                        profile.documents.some(sample =>
                            sample.id === id && selectedNames.has(sample.fileName)
                        )
                    )
                );
                demoSampleIds.value = JSON.stringify(currentSampleIds);
                renderSelectedDocuments();
            });
        });
    }

    async function fetchSampleFile(sampleId) {
        const response = await fetch(`/api/patient/demo-documents/${encodeURIComponent(sampleId)}`, {
            headers: { Authorization: "Bearer " + token }
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Sample download failed (${response.status}).`);
        }
        return response.blob();
    }

    async function downloadSampleDocument(button) {
        button.disabled = true;
        try {
            const profile = documentProfiles.find(item => item.id === samplePatient.value);
            const sample = profile?.documents.find(item => item.id === button.dataset.downloadSample);
            if (!sample) throw new Error("Choose a valid fictional sample document.");
            const blob = await fetchSampleFile(sample.id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = sample.fileName;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            showNotice(error.message, true);
        } finally {
            button.disabled = false;
        }
    }

    async function previewSampleDocument(button) {
        button.disabled = true;
        try {
            const blob = await fetchSampleFile(button.dataset.previewSample);
            const preview = content.querySelector("#sample-preview");
            const oldUrl = preview.dataset.objectUrl;
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            const url = URL.createObjectURL(blob);
            preview.dataset.objectUrl = url;
            preview.hidden = false;
            preview.innerHTML = `
                <div class="panel-header">
                    <strong>Fictional PDF preview · not valid for medical use</strong>
                    <button class="button button-quiet" type="button" data-close-preview>Close preview</button>
                </div>
                <iframe title="Fictional sample PDF preview" src="${url}"></iframe>`;
            preview.querySelector("[data-close-preview]").addEventListener("click", () => {
                URL.revokeObjectURL(url);
                preview.removeAttribute("data-object-url");
                preview.hidden = true;
                preview.replaceChildren();
            });
        } catch (error) {
            showNotice(error.message, true);
        } finally {
            button.disabled = false;
        }
    }

    async function addSampleDocument(button) {
        button.disabled = true;
        try {
            const profile = documentProfiles.find(item => item.id === samplePatient.value);
            const sample = profile?.documents.find(item => item.id === button.dataset.uploadSample);
            if (!sample) throw new Error("Choose a valid fictional sample document.");
            const existing = Array.from(documentInput.files || []);
            if (existing.length >= 5) throw new Error("Upload no more than five files per request.");
            if (existing.some(file => file.name === sample.fileName)) {
                throw new Error("That sample document is already selected.");
            }
            const blob = await fetchSampleFile(sample.id);
            const file = new File([blob], sample.fileName, { type: "application/pdf" });
            const transfer = new DataTransfer();
            existing.forEach(item => transfer.items.add(item));
            transfer.items.add(file);
            documentInput.files = transfer.files;
            currentSampleIds = [...new Set([...currentSampleIds, sample.id])];
            demoSampleIds.value = JSON.stringify(currentSampleIds);
            renderSelectedDocuments();
            showNotice(`${sample.label} added. It will be privately uploaded when you submit the request.`);
        } catch (error) {
            showNotice(error.message, true);
        } finally {
            button.disabled = false;
        }
    }

    organSelect.addEventListener("change", async () => {
        hospitalResults.innerHTML = `<p class="panel-description">Checking verified hospital listings…</p>`;
        try {
            const result = await api(`/api/patient/hospitals?organType=${encodeURIComponent(organSelect.value)}`);
            const hospitals = result.hospitals || [];
            hospitalResults.innerHTML = hospitals.length
                ? `<p class="availability-count">${hospitals.length} verified hospital(s) currently report availability. One request will be sent to all of them.</p>
                   ${hospitals.map(hospital => `
                    <article class="availability-card">
                        <span>
                            <strong>${escapeHtml(hospital.name)}</strong>
                            <small>${escapeHtml(hospital.city)}, ${escapeHtml(hospital.state)} · ${escapeHtml(organSelect.value)} · ${hospital.availableUnits} reported unit(s)</small>
                        </span>
                        <span class="availability-tag">${escapeHtml(hospital.availabilityStatus)} · verified</span>
                    </article>
                   `).join("")}
                   <p class="security-note">Reported availability does not guarantee medical suitability, compatibility or eligibility.</p>`
                : `<div class="empty-state">No verified hospital currently lists ${escapeHtml(organSelect.value)} as available. Check again later.</div>`;
        } catch (error) {
            hospitalResults.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const files = Array.from(documentInput.files || []);
        if (!files.length || files.length > 5 || files.some(file => file.size > 5 * 1024 * 1024)) {
            showNotice("Attach 1-5 documents, each no larger than 5 MB.", true);
            return;
        }
        await submitForm(event.submitter, async () => {
            const progress = content.querySelector("#request-upload-progress");
            const label = content.querySelector("#request-upload-progress-label");
            progress.hidden = false;
            const created = await uploadPatientRequest(new FormData(form), value => {
                progress.value = value;
                label.textContent = `Secure upload progress: ${value}%`;
            });
            progress.value = 100;
            label.textContent = "Private upload complete.";
            await openView("requests");
            showNotice(`${created.message || "Request submitted for review."}${created.hospitalsNotified ? ` ${created.hospitalsNotified} hospital(s) notified.` : ""}`);
        });
    });
}

async function renderInventory() {
    const result = await api("/api/hospital/dashboard");
    const inventory = result.hospital.inventory || [];
    const inventoryHistory = inventory
        .flatMap(item => (item.history || []).map(entry => ({
            ...entry,
            organType: item.organType
        })))
        .sort((first, second) =>
            new Date(second.changedAt).getTime() - new Date(first.changedAt).getTime()
        )
        .slice(0, 30);
    content.innerHTML = `
        ${intro("Hospital demo inventory", "Update the illustrative inventory record for your verified hospital account.")}
        ${demoBanner()}
        <section class="panel">
            <form id="inventory-form">
                <div class="form-grid">
                    <div class="field"><label for="inventory-organ">Organ type</label><select id="inventory-organ" name="organType" required>${["Kidney", "Liver", "Heart", "Lungs", "Pancreas", "Intestine"].map(item => `<option>${item}</option>`).join("")}</select></div>
                    <div class="field"><label for="inventory-units">Available units (demo)</label><input id="inventory-units" name="availableUnits" type="number" min="0" max="999" step="1" value="0" required></div>
                    <div class="field"><label for="inventory-reason">Change reason</label><input id="inventory-reason" name="reason" maxlength="500" required></div>
                </div>
                <div class="form-actions"><button class="button button-primary" type="submit">Save inventory</button></div>
            </form>
        </section>
        <section class="panel">
            <div class="panel-header"><h2>Current inventory</h2></div>
            ${inventory.length ? `<div class="table-wrap"><table><thead><tr><th>Organ</th><th>Units (demo)</th><th>Last updated</th></tr></thead><tbody>${inventory.map(item => `<tr><td>${escapeHtml(item.organType)}</td><td>${item.availableUnits}</td><td>${item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">No inventory records have been added.</div>`}
        </section>
        <section class="panel">
            <div class="panel-header"><h2>Inventory change history</h2></div>
            ${inventoryHistory.length ? `<div class="table-wrap"><table><thead><tr><th>Changed</th><th>Organ</th><th>Units</th><th>Reason</th></tr></thead><tbody>${inventoryHistory.map(entry => `<tr><td>${entry.changedAt ? new Date(entry.changedAt).toLocaleString() : "—"}</td><td>${escapeHtml(entry.organType)}</td><td>${entry.previousAvailableUnits === null || entry.previousAvailableUnits === undefined ? "Initial" : entry.previousAvailableUnits} → ${entry.availableUnits}</td><td>${escapeHtml(entry.reason)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">No inventory changes recorded yet.</div>`}
        </section>`;
    content.querySelector("#inventory-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const payload = {
            organType: form.elements.namedItem("organType").value,
            availableUnits: Number(form.elements.namedItem("availableUnits").value),
            reason: form.elements.namedItem("reason").value.trim()
        };
        await submitForm(event.submitter, async () => {
            const saved = await api("/api/hospital/inventory", { method: "POST", body: payload });
            showNotice(saved.message || "Inventory saved.");
            await renderInventory();
        });
    });
}

async function renderDrivers() {
    const result = await api("/api/hospital/drivers");
    const drivers = result.drivers || [];
    content.innerHTML = `
        ${intro("Hospital drivers", "Create driver accounts with a private email invitation and manage their availability.")}
        ${demoBanner()}
        <section class="panel">
            <div class="panel-header"><h2>Invite a driver</h2></div>
            <form id="create-driver-form" class="form-grid">
                <label>Full name<input name="name" autocomplete="name" maxlength="100" required></label>
                <label>Email address<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
                <label>Phone number<input name="phone" type="tel" autocomplete="tel" placeholder="+919876543210" pattern="\\+[1-9][0-9]{7,14}" required></label>
                <label>Vehicle type<input name="vehicleType" maxlength="60" placeholder="Van" required></label>
                <label>Vehicle registration number<input name="vehicleNumber" maxlength="20" required></label>
                <button class="button button-primary" type="submit">Create driver and email invite</button>
            </form>
        </section>
        ${drivers.length ? `<div class="application-list">${drivers.map(driver => `
            <article class="application-card" data-driver-id="${escapeHtml(String(driver._id))}">
                <div>
                    <h3>${escapeHtml(driver.name)}</h3>
                    <p>${escapeHtml(driver.email)} · ${escapeHtml(driver.phone)}</p>
                    <p>${escapeHtml(driver.vehicleType || "Vehicle not set")} · ${escapeHtml(driver.vehicleNumber || "Registration not set")}</p>
                    <p>Account: ${driver.approved ? "Approved" : "Waiting for hospital approval"} · Status: ${driver.isActive === false ? "Deactivated" : "Active"} · Availability: ${escapeHtml(driver.availabilityStatus || "available")}</p>
                </div>
                ${driver.approved
                    ? `<button class="button button-quiet" type="button" data-toggle-driver data-next-active="${driver.isActive === false}">${driver.isActive === false ? "Activate driver" : "Deactivate driver"}</button>`
                    : `<button class="button button-primary" type="button" data-approve-driver>Approve driver</button>`}
            </article>
        `).join("")}</div>` : `<div class="empty-state">No drivers have registered with your hospital yet.</div>`}
        <p class="security-note">Only invite drivers whose identity, contact details, vehicle, and hospital affiliation you have verified.</p>`;
    content.querySelector("#create-driver-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const payload = Object.fromEntries(new FormData(form).entries());
        await submitForm(event.submitter, async () => {
            const created = await api("/api/hospital/drivers", {
                method: "POST",
                body: payload
            });
            showNotice(created.message);
            await renderDrivers();
        });
    });
    content.querySelectorAll("[data-toggle-driver]").forEach(button => {
        button.addEventListener("click", async () => {
            const card = button.closest("[data-driver-id]");
            await submitForm(button, async () => {
                const updated = await api(`/api/hospital/drivers/${encodeURIComponent(card.dataset.driverId)}`, {
                    method: "PATCH",
                    body: { isActive: button.dataset.nextActive === "true" }
                });
                showNotice(updated.message);
                await renderDrivers();
            });
        });
    });
    content.querySelectorAll("[data-approve-driver]").forEach(button => {
        button.addEventListener("click", async () => {
            const card = button.closest("[data-driver-id]");
            await submitForm(button, async () => {
                const updated = await api(`/api/hospital/drivers/${encodeURIComponent(card.dataset.driverId)}/approve`, {
                    method: "PATCH",
                    body: {}
                });
                showNotice(updated.message);
                await renderDrivers();
            });
        });
    });
}

async function renderDeliveries() {
    const result = await api("/api/driver/dashboard");
    const requests = result.requests || [];
    cleanupTrackingMaps();
    content.innerHTML = `
        ${intro("Assigned deliveries", "Choose a road-route option before departure. Location sharing starts only when you begin a delivery.")}
        ${demoBanner()}
        <section class="panel">
            <div class="panel-header">
                <p>Availability: <strong>${escapeHtml(currentUser.availabilityStatus || "available")}</strong></p>
                <button class="button button-quiet" type="button" data-toggle-availability data-next-availability="${currentUser.availabilityStatus === "unavailable" ? "available" : "unavailable"}">${currentUser.availabilityStatus === "unavailable" ? "Go available" : "Go unavailable"}</button>
            </div>
            <p class="panel-description">Unavailable drivers cannot receive new hospital assignments.</p>
        </section>
        ${requests.length ? requests.map(request => `
            <article class="panel driver-delivery" data-request-id="${escapeHtml(String(request._id))}">
                <div class="panel-header">
                    <h2>${escapeHtml(request.organType)} · ${escapeHtml(request.status)}</h2>
                    <span class="status-badge ${statusClass(request.status)}">${escapeHtml(request.status)}</span>
                </div>
                <p class="panel-description">
                    ${escapeHtml(request.sourceHospitalId?.name || request.sourceHospital)} →
                    ${escapeHtml(request.recipientHospitalId?.name || request.recipientHospital)}
                </p>
                <p class="panel-description">Request ${escapeHtml(String(request._id).slice(-8).toUpperCase())} · Patient: ${escapeHtml(request.patientId?.name || "Patient")}</p>
                ${request.status === "Assigned" ? `
                    ${request.selectedRouteId
                        ? `<p class="route-selected">Selected ${escapeHtml(request.selectedRouteId)} · ${Number(request.selectedRoute.distanceKm).toFixed(1)} km · about ${request.selectedRoute.durationMinutes} min</p>
                           ${renderRouteSteps(request.selectedRoute.steps)}
                           <button class="button button-primary" type="button" data-start-delivery>Start delivery and share location</button>`
                        : `<button class="button button-primary" type="button" data-show-routes>View routes and choose one</button>`}
                    <div class="route-results" data-route-results></div>
                ` : ""}
                ${request.status === "In Transit" ? `
                    <p class="panel-description">Live location sharing is active for this assigned delivery.</p>
                    ${renderRouteSteps(request.selectedRoute?.steps)}
                    <div class="driver-map" id="driver-map-${escapeHtml(String(request._id))}" aria-label="Delivery route and driver location map"></div>
                    <div class="form-actions"><button class="button button-primary" type="button" data-complete-delivery>Mark delivered</button></div>
                ` : ""}
                ${["Delivered", "Rejected"].includes(request.status) ? `<p class="panel-description">This delivery is closed.</p>` : ""}
            </article>
        `).join("") : `<div class="empty-state">No deliveries are assigned to your account.</div>`}`;

    content.querySelector("[data-toggle-availability]").addEventListener("click", async event => {
        const button = event.currentTarget;
        await submitForm(button, async () => {
            const updated = await api("/api/driver/availability", {
                method: "PATCH",
                body: { availabilityStatus: button.dataset.nextAvailability }
            });
            currentUser.availabilityStatus = updated.availabilityStatus;
            showNotice(updated.message);
            await renderDeliveries();
        });
    });

    requests.filter(request => request.status === "In Transit").forEach(request => {
        initializeActiveDriverMap(request);
    });

    content.querySelectorAll("[data-show-routes]").forEach(button => {
        button.addEventListener("click", async () => {
            const card = button.closest("[data-request-id]");
            button.disabled = true;
            try {
                const routes = await api(`/api/driver/requests/${encodeURIComponent(card.dataset.requestId)}/routes`);
                renderDriverRouteOptions(card, routes);
            } catch (error) {
                showNotice(error.message, true);
                button.disabled = false;
            }
        });
    });

    content.querySelectorAll("[data-start-delivery]").forEach(button => {
        button.addEventListener("click", async () => {
            if (!navigator.geolocation) {
                showNotice("This browser does not support GPS location sharing.", true);
                return;
            }
            button.disabled = true;
            navigator.geolocation.getCurrentPosition(async position => {
                const card = button.closest("[data-request-id]");
                try {
                    const started = await api(`/api/driver/requests/${encodeURIComponent(card.dataset.requestId)}/start`, {
                        method: "POST",
                        body: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        }
                    });
                    showNotice(started.message);
                    startDriverLocationSharing(card.dataset.requestId);
                    await renderDeliveries();
                } catch (error) {
                    showNotice(error.message, true);
                    button.disabled = false;
                }
            }, error => {
                showNotice(`GPS permission is needed to start sharing: ${error.message}`, true);
                button.disabled = false;
            }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
        });
    });

    content.querySelectorAll("[data-complete-delivery]").forEach(button => {
        button.addEventListener("click", async () => {
            const card = button.closest("[data-request-id]");
            await submitForm(button, async () => {
                const done = await api(`/api/driver/requests/${encodeURIComponent(card.dataset.requestId)}/delivered`, {
                    method: "PATCH",
                    body: {}
                });
                stopDriverLocationSharing();
                showNotice(done.message);
                await renderDeliveries();
            });
        });
    });
}

function renderRouteSteps(steps) {
    if (!Array.isArray(steps) || !steps.length) return "";
    return `<details class="route-directions"><summary>Turn-by-turn directions</summary><ol>${steps.map(step => `
        <li>${escapeHtml(step.instruction || "Continue")} ${step.distanceText ? `<small>(${escapeHtml(step.distanceText)})</small>` : ""}</li>
    `).join("")}</ol></details>`;
}

function renderDriverRouteOptions(card, routes) {
    const routeResults = card.querySelector("[data-route-results]");
    const mapId = `driver-route-map-${String(card.dataset.requestId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    routeResults.innerHTML = `
        <div class="driver-map" id="${escapeHtml(mapId)}" aria-label="Available delivery routes map"></div>
        <div class="route-option-list">
            ${(routes.routeOptions || []).map(route => `
                <article class="route-option ${route.id === routes.shortestRouteId ? "shortest" : ""}">
                    <div>
                        <strong>${escapeHtml(route.name)}${route.id === routes.shortestRouteId ? " · Shortest" : ""}</strong>
                        <p>${Number(route.distanceKm).toFixed(1)} km · approximately ${route.durationMinutes} min</p>
                        ${renderRouteSteps(route.steps)}
                    </div>
                    <button class="button button-primary" type="button" data-select-route="${escapeHtml(route.id)}">Choose route</button>
                </article>
            `).join("")}
        </div>
        <p class="security-note">${escapeHtml(routes.warning || "Up to three route alternatives are supplied by the demo mapping service; the shortest by road distance is highlighted. Estimates are not for clinical transport.")}</p>`;

    if (window.L && routes.routeOptions?.length) {
        const map = window.L.map(mapId);
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);
        const colors = ["#087f5b", "#2673c8", "#db8b22", "#8c5ac7"];
        const routeLayers = routes.routeOptions.map((route, index) =>
            window.L.geoJSON(route.geometry, {
                style: {
                    color: colors[index % colors.length],
                    weight: route.id === routes.shortestRouteId ? 7 : 4,
                    opacity: route.id === routes.shortestRouteId ? 0.9 : 0.65
                }
            }).addTo(map)
        );
        const bounds = window.L.featureGroup(routeLayers).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } else {
        routeResults.insertAdjacentHTML("afterbegin", `<p class="security-note">The route map could not load; route options are still available below.</p>`);
    }

    routeResults.querySelectorAll("[data-select-route]").forEach(button => {
        button.addEventListener("click", async () => {
            await submitForm(button, async () => {
                const selected = await api(`/api/driver/requests/${encodeURIComponent(card.dataset.requestId)}/route`, {
                    method: "POST",
                    body: { routeId: button.dataset.selectRoute }
                });
                showNotice(selected.message);
                await renderDeliveries();
            });
        });
    });
}

function initializeActiveDriverMap(request) {
    const mapElementId = `driver-map-${String(request._id)}`;
    if (!window.L || !request.selectedRoute?.geometry) return;
    const mapElement = document.getElementById(mapElementId);
    if (!mapElement) return;

    driverMap = window.L.map(mapElementId);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(driverMap);
    const routeLayer = window.L.geoJSON(request.selectedRoute.geometry, {
        style: { color: "#087f5b", weight: 5 }
    }).addTo(driverMap);
    const bounds = routeLayer.getBounds();
    if (bounds.isValid()) driverMap.fitBounds(bounds, { padding: [20, 20] });
    const location = request.driverLocation;
    if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
        driverMapMarker = window.L.marker([location.latitude, location.longitude])
            .addTo(driverMap)
            .bindPopup("Your current location");
    }
}

function startDriverLocationSharing(requestId) {
    if (!navigator.geolocation) return;
    stopDriverLocationSharing();
    driverWatchId = navigator.geolocation.watchPosition(async position => {
        if (Date.now() - lastLocationSentAt < 5000) return;
        lastLocationSentAt = Date.now();
        const point = [position.coords.latitude, position.coords.longitude];
        if (driverMap) {
            if (driverMapMarker) driverMapMarker.setLatLng(point);
            else driverMapMarker = window.L.marker(point).addTo(driverMap).bindPopup("Your current location");
        }
        try {
            await api(`/api/driver/requests/${encodeURIComponent(requestId)}/location`, {
                method: "POST",
                body: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }
            });
        } catch (error) {
            showNotice(`Live location update failed: ${error.message}`, true);
        }
    }, error => showNotice(`Live location sharing stopped: ${error.message}`, true), {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
    });
}

function stopDriverLocationSharing() {
    if (driverWatchId !== null) {
        navigator.geolocation.clearWatch(driverWatchId);
        driverWatchId = null;
    }
    driverMap = null;
    driverMapMarker = null;
}

async function renderApplications() {
    const result = await api("/api/admin/hospitals/pending");
    const applications = result.applications || [];
    content.innerHTML = `
        ${intro("Hospital approvals", "Review hospital identity and application details before enabling a hospital workspace.")}
        ${metrics([["Pending applications", result.total], ["Decision authority", "Admin"]])}
        ${applications.length ? `<div class="application-list">${applications.map(application => {
            const user = application.user || {};
            const hospital = application.hospital || {};
            return `<article class="application-card" data-user-id="${escapeHtml(String(user._id || ""))}">
                <div>
                    <h3>${escapeHtml(hospital.name || user.name || "Hospital application")}</h3>
                    <p>${escapeHtml(hospital.address || "Address not provided")}</p>
                    <p>${escapeHtml([hospital.city, hospital.state].filter(Boolean).join(", ") || "Location not provided")}</p>
                    <p>Registration / license: ${escapeHtml(hospital.registrationNumber || "Not provided")} · Speciality: ${escapeHtml(hospital.speciality || "Not provided")}</p>
                    <p>Contact: ${escapeHtml(user.email || "")} · ${escapeHtml(user.phone || "")}</p>
                    <p>Submitted ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : ""}</p>
                </div>
                <div class="application-actions">
                    <button class="button button-primary" type="button" data-decision="approve">Approve</button>
                    <button class="button button-danger" type="button" data-decision="reject">Reject</button>
                </div>
            </article>`;
        }).join("")}</div>` : `<div class="empty-state">No hospital applications are pending review.</div>`}
        <p class="security-note">Approval enables access to hospital tools. Verify applications according to your organisation's review process.</p>`;
    content.querySelectorAll("[data-decision]").forEach((button) => {
        button.addEventListener("click", async () => {
            const card = button.closest("[data-user-id]");
            const decision = button.dataset.decision;
            const action = decision === "approve" ? "approve" : "reject";
            if (decision === "reject" && !window.confirm("Reject this hospital application?")) return;
            button.disabled = true;
            try {
                const changed = await api(`/api/admin/hospitals/${encodeURIComponent(card.dataset.userId)}/${action}`, { method: "PATCH", body: {} });
                showNotice(changed.message || "Application updated.");
                await renderApplications();
            } catch (error) {
                showNotice(error.message, true);
                button.disabled = false;
            }
        });
    });
}

function requestTable(requests, title, hospitalActions = false, drivers = [], destinations = []) {
    const rows = requests.map(request => `
        <tr data-request-id="${escapeHtml(String(request._id || ""))}">
            <td>${escapeHtml(String(request._id || "").slice(-8).toUpperCase())}</td>
            <td>${escapeHtml(request.organType || "")}</td>
            <td>${escapeHtml(clinicalPriorityLabel(request.hospitalResponse?.clinicalPriority || request.clinicalPriority))}</td>
            <td>${hospitalActions
                ? escapeHtml(request.patientId?.name || "Patient")
                : `${(request.hospitalResponses || []).length} hospital(s)`}</td>
            <td><span class="status-badge ${statusClass(request.status)}">${escapeHtml(request.status || "Pending")}</span></td>
            <td>${hospitalActions
                ? hospitalRequestAction(request, drivers, destinations)
                : patientRequestAction(request)}</td>
        </tr>
    `).join("");
    return `<section class="panel">
        <div class="panel-header"><h2>${escapeHtml(title)}</h2></div>
        ${requests.length ? `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Organ</th><th>Clinical assessment</th><th>${hospitalActions ? "Patient" : "Hospitals notified"}</th><th>Status</th><th>${hospitalActions ? "Review / dispatch" : "Hospital responses / documents"}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state">No requests to display yet.</div>`}
    </section>`;
}

function hospitalRequestAction(request, drivers, destinations) {
    const requestId = escapeHtml(String(request._id));
    const response = request.hospitalResponse || null;
    const hospitalId = String(response?.hospitalId?._id || response?.hospitalId || "");
    const isSelectedHospital = String(request.hospitalId?._id || request.hospitalId) === hospitalId;
    const documents = (request.documents || []).map(document => `
        <div class="document-review-row">
          <div>
            <strong>${escapeHtml(document.originalName)}</strong>
            ${document.isDemoSample ? `<small class="fictional-label">FICTIONAL SAMPLE · ${escapeHtml(document.demoProfileName || "")}</small>` : ""}
            <button class="text-button" type="button" data-preview-document="${requestId}" data-document-id="${escapeHtml(String(document._id))}" data-file-name="${escapeHtml(document.originalName)}">Preview</button>
            <button class="text-button document-download"
            type="button"
            data-document-request="${requestId}"
            data-document-id="${escapeHtml(String(document._id))}"
            data-file-name="${escapeHtml(document.originalName)}">
            Download
            </button>
            ${(() => {
                const review = (document.reviewByHospital || []).find(item =>
                    String(item.hospitalId?._id || item.hospitalId) === hospitalId
                );
                return `<span class="status-badge ${statusClass(review?.status || "pending")}">${escapeHtml(review?.status || "pending")}</span>
                    ${review?.status === "rejected" ? `<small class="document-reason">Reason: ${escapeHtml(review.reason || "")}</small>` : ""}
                    ${response?.status === "Pending Verification" ? `
                      <div class="document-review-controls">
                        <select class="inline-select" data-document-review="${escapeHtml(String(document._id))}" aria-label="Document verification status">
                          <option value="verified">Mark verified</option>
                          <option value="rejected">Reject document</option>
                        </select>
                        <input class="inline-rejection-reason" data-document-reason type="text" maxlength="1000" placeholder="Required rejection reason">
                        <button class="button button-quiet" type="button" data-save-document-review>Save</button>
                      </div>` : ""}`;
            })()}
          </div>
        </div>
    `).join("");
    const review = response?.status === "Pending Medical Review"
        ? `<div class="medical-review-controls">
            <label>Staff-assessed priority (not automated)</label>
            <select class="inline-select" data-clinical-priority aria-label="Set staff-assessed clinical priority">
                ${["routine", "urgent", "critical"].map(priority => `
                    <option value="${priority}"${response.clinicalPriority === priority ? " selected" : ""}>${clinicalPriorityLabel(priority)}</option>
                `).join("")}
            </select>
            <textarea data-priority-reason maxlength="1000" placeholder="Required clinical assessment reason">${escapeHtml(response.priorityReason || "")}</textarea>
            <button class="button button-quiet" type="button" data-save-priority>Save medical review</button>
          </div>`
        : "";
    if (response?.status === "Assigned" && response.deliveryPreference === "self") {
        return `<div class="delivery-summary">${review}${documents}<button class="button button-quiet" type="button" data-complete-self>Confirm pickup complete</button></div>`;
    }
    if (response?.status === "Pending Medical Review") {
        return `<div class="delivery-summary">${review}${documents}
            <select class="inline-select" data-request-status aria-label="Approve or reject request">
                <option value="">Review request…</option>
                <option value="Approved">Approve</option>
                <option value="Rejected">Reject</option>
            </select>
            <input class="inline-rejection-reason" data-request-reason type="text" maxlength="1000" placeholder="Required reason for rejection">
        </div>`;
    }
    if (isSelectedHospital && response?.status === "Approved" && request.deliveryPreference === "delivery" && !request.driverId) {
        const approvedDrivers = drivers.filter(driver =>
            driver.approved &&
            driver.isActive !== false &&
            driver.availabilityStatus !== "unavailable"
        );
        const receivingHospitals = destinations.filter(destination =>
            destination.id !== String(request.sourceHospitalId || "")
        );
        return approvedDrivers.length && receivingHospitals.length
            ? `<div class="delivery-summary">${documents}
              <select class="inline-select" data-assign-driver aria-label="Assign an approved driver">
                <option value="">Assign driver…</option>
                ${approvedDrivers.map(driver => `<option value="${escapeHtml(String(driver._id))}">${escapeHtml(driver.name)}</option>`).join("")}
              </select>
              <select class="inline-select" data-delivery-destination aria-label="Select receiving hospital">
                <option value="">Receiving hospital…</option>
                ${receivingHospitals.map(destination => `<option value="${escapeHtml(destination.id)}">${escapeHtml(destination.name)} · ${escapeHtml(destination.city)}</option>`).join("")}
              </select>
              </div>`
            : `<div class="delivery-summary">${documents}<span class="panel-description">${approvedDrivers.length ? "No other verified hospital has route coordinates." : "No approved drivers. Review drivers first."}</span></div>`;
    }
    if (isSelectedHospital && request.status === "In Transit" && request.driverId) {
        return `<div class="delivery-summary">${documents}
            <button class="text-button" type="button" data-track-id="${requestId}">Refresh driver, route and location</button>
            <div class="tracking-details" data-tracking-for="${requestId}"></div>
            <div class="tracking-map" id="tracking-map-${requestId}" aria-label="Driver location and route map"></div>
        </div>`;
    }
    if (isSelectedHospital && request.status === "Assigned" && request.driverId) {
        return `<div class="delivery-summary">${review}${documents}<span>Driver assigned; awaiting departure.</span></div>`;
    }
    return `<div class="delivery-summary">
        <span>${escapeHtml(response?.status || request.status || "Pending")}</span>
        ${response?.responseReason ? `<span class="document-reason">Reason: ${escapeHtml(response.responseReason)}</span>` : ""}
        ${response?.status === "Pending Verification" ? `<span>Waiting for this hospital to review the documents.</span>` : ""}
        ${review}${documents}
    </div>`;
}

function patientRequestAction(request) {
    const hospitals = (request.hospitalResponses || []).map(response => {
        const hospital = response.hospitalId || {};
        const hospitalId = String(hospital._id || hospital);
        const documents = (request.documents || []).map(document => {
            const review = (document.reviewByHospital || []).find(item =>
                String(item.hospitalId?._id || item.hospitalId) === hospitalId
            );
            return `<li>${escapeHtml(document.originalName)}${document.isDemoSample ? ` <span class="fictional-label">FICTIONAL SAMPLE · ${escapeHtml(document.demoProfileName || "")}</span>` : ""}
                <span class="status-badge ${statusClass(review?.status || "pending")}">${escapeHtml(review?.status || "pending")}</span>
                ${review?.status === "rejected" ? `<small class="document-reason">Reason: ${escapeHtml(review.reason || "")}</small>` : ""}
                ${review?.status === "rejected" ? `<div class="replacement-upload">
                    <input type="file" data-replacement-file accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label="Choose a replacement document">
                    <button class="button button-quiet" type="button" data-upload-replacement="${escapeHtml(String(document._id))}">Upload replacement</button>
                </div>` : ""}
            </li>`;
        }).join("");
        const delivery = response.status === "Approved" && request.deliveryPreference === "pending"
            ? `<div class="delivery-choice">
                <button class="button button-quiet" type="button" data-delivery-choice="self" data-hospital-id="${escapeHtml(hospitalId)}">Self pickup</button>
                <button class="button button-primary" type="button" data-delivery-choice="delivery" data-hospital-id="${escapeHtml(hospitalId)}">Hospital delivery</button>
               </div>`
            : "";
        const tracking = response.status === "In Transit" && String(request.hospitalId?._id || request.hospitalId) === hospitalId
            ? `<button class="text-button" type="button" data-track-id="${escapeHtml(String(request._id))}">Refresh driver and location</button>
               <div class="tracking-details" data-tracking-for="${escapeHtml(String(request._id))}"></div>
               <div class="tracking-map" id="tracking-map-${escapeHtml(String(request._id))}" aria-label="Driver location and route map"></div>`
            : "";
        return `<article class="patient-response-card">
            <strong>${escapeHtml(hospital.name || "Verified hospital")}</strong>
            <span class="status-badge ${statusClass(response.status)}">${escapeHtml(response.status)}</span>
            ${response.responseReason ? `<p class="document-reason">Reason: ${escapeHtml(response.responseReason)}</p>` : ""}
            ${response.priorityReason ? `<p class="panel-description">Hospital review: ${escapeHtml(response.priorityReason)}</p>` : ""}
            <details><summary>My documents and verification status</summary><ul class="patient-document-list">${documents}</ul></details>
            ${delivery}${tracking}
        </article>`;
    }).join("");
    const anyRejectedDocument = (request.documents || []).some(document =>
        (document.reviewByHospital || []).some(review => review.status === "rejected")
    );
    return `<div class="patient-response-list">
        ${hospitals || `<span>${escapeHtml(request.status || "Pending Verification")}</span>`}
        ${anyRejectedDocument ? `<span class="security-note">A hospital rejected a document. Upload a corrected replacement with a new request and include the reason shown above.</span>` : ""}
        ${request.status === "In Transit" && request.driverId ? `
            <p class="panel-description">Driver: ${escapeHtml(request.driverId.name || "Assigned")} · ${escapeHtml(request.driverId.vehicleNumber || "")}</p>` : ""}
    </div>`;
}

function clinicalPriorityLabel(priority) {
    return ({
        needs_review: "Needs clinician review",
        routine: "Routine",
        urgent: "Urgent",
        critical: "Critical"
    })[priority] || "Needs clinician review";
}

function attachHospitalRequestActions() {
    content.querySelectorAll("[data-request-id] [data-request-status]").forEach((select) => {
        select.addEventListener("change", async () => {
            if (!select.value) return;
            const row = select.closest("[data-request-id]");
            select.disabled = true;
            try {
                const result = await api(`/api/hospital/requests/${encodeURIComponent(row.dataset.requestId)}/status`, {
                    method: "PATCH",
                    body: {
                        status: select.value,
                        reason: row.querySelector("[data-request-reason]")?.value || ""
                    }
                });
                showNotice(result.message || "Request status updated.");
                await renderRequests();
            } catch (error) {
                showNotice(error.message, true);
                select.disabled = false;
                select.value = "";
            }
        });
    });

    content.querySelectorAll("[data-request-id] [data-save-document-review]").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest("[data-request-id]");
            const documentRow = button.closest(".document-review-row");
            const documentSelect = documentRow.querySelector("[data-document-review]");
            const reason = documentRow.querySelector("[data-document-reason]").value.trim();
            if (documentSelect.value === "rejected" && !reason) {
                showNotice("Enter a reason before rejecting a document.", true);
                return;
            }
            await submitForm(button, async () => {
                const result = await api(
                    `/api/hospital/requests/${encodeURIComponent(row.dataset.requestId)}/documents/${encodeURIComponent(documentSelect.dataset.documentReview)}/review`,
                    {
                        method: "PATCH",
                        body: { status: documentSelect.value, reason }
                    }
                );
                showNotice(result.message);
                await renderRequests();
            });
        });
    });

    content.querySelectorAll("[data-request-id] [data-assign-driver], [data-request-id] [data-delivery-destination]").forEach(select => {
        select.addEventListener("change", async () => {
            const row = select.closest("[data-request-id]");
            const driverSelect = row.querySelector("[data-assign-driver]");
            const destinationSelect = row.querySelector("[data-delivery-destination]");
            if (!driverSelect.value || !destinationSelect.value) return;
            driverSelect.disabled = true;
            destinationSelect.disabled = true;
            try {
                const result = await api(`/api/hospital/requests/${encodeURIComponent(row.dataset.requestId)}/driver`, {
                    method: "POST",
                    body: {
                        driverId: driverSelect.value,
                        recipientHospitalId: destinationSelect.value
                    }
                });
                showNotice(result.message);
                await renderRequests();
            } catch (error) {
                showNotice(error.message, true);
                driverSelect.disabled = false;
                destinationSelect.disabled = false;
                select.value = "";
            }
        });
    });

    content.querySelectorAll("[data-request-id] [data-save-priority]").forEach(button => {
        button.addEventListener("click", async () => {
            const select = button.closest(".medical-review-controls").querySelector("[data-clinical-priority]");
            const priorityReason = button.closest(".medical-review-controls").querySelector("[data-priority-reason]").value.trim();
            if (!priorityReason) {
                showNotice("Enter the reason for the staff-assessed priority.", true);
                return;
            }
            const row = select.closest("[data-request-id]");
            await submitForm(button, async () => {
                const updated = await api(`/api/hospital/requests/${encodeURIComponent(row.dataset.requestId)}/clinical-priority`, {
                    method: "PATCH",
                    body: { clinicalPriority: select.value, priorityReason }
                });
                showNotice(updated.message);
                await renderRequests();
            });
        });
    });

    content.querySelectorAll("[data-document-id]").forEach(button => {
        button.addEventListener("click", () => downloadRequestDocument(button));
    });
    content.querySelectorAll("[data-preview-document]").forEach(button => {
        button.addEventListener("click", () => previewRequestDocument(button));
    });

    content.querySelectorAll("[data-request-id] [data-complete-self]").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest("[data-request-id]");
            await submitForm(button, async () => {
                const result = await api(`/api/hospital/requests/${encodeURIComponent(row.dataset.requestId)}/status`, {
                    method: "PATCH",
                    body: { status: "Delivered" }
                });
                showNotice(result.message);
                await renderRequests();
            });
        });
    });
}

async function downloadRequestDocument(button) {
    button.disabled = true;
    try {
        const response = await fetch(
            `/api/hospital/requests/${encodeURIComponent(button.dataset.documentRequest)}/documents/${encodeURIComponent(button.dataset.documentId)}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || `Document download failed (${response.status}).`);
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = button.dataset.fileName || "verification-document";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        button.disabled = false;
    }
}

function attachPatientRequestActions() {
    content.querySelectorAll("[data-request-id] [data-delivery-choice]").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest("[data-request-id]");
            await submitForm(button, async () => {
                const result = await api(`/api/patient/requests/${encodeURIComponent(row.dataset.requestId)}/delivery`, {
                    method: "PATCH",
                    body: {
                        preference: button.dataset.deliveryChoice,
                        hospitalId: button.dataset.hospitalId
                    }
                });
                await openView("requests");
                showNotice(result.message);
            });
        });
    });

    content.querySelectorAll("[data-upload-replacement]").forEach(button => {
        button.addEventListener("click", async () => {
            const row = button.closest("[data-request-id]");
            const input = button.closest("li").querySelector("[data-replacement-file]");
            const file = input.files?.[0];
            if (!file) {
                showNotice("Choose a replacement PDF, JPG or PNG first.", true);
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                showNotice("Replacement documents must be 5 MB or smaller.", true);
                return;
            }
            const replacement = new FormData();
            replacement.append("documents", file);
            replacement.append("replacesDocumentId", button.dataset.uploadReplacement);
            await submitForm(button, async () => {
                const result = await api(
                    `/api/patient/requests/${encodeURIComponent(row.dataset.requestId)}/documents`,
                    { method: "POST", body: replacement }
                );
                showNotice(result.message);
                await renderRequests();
            });
        });
    });
}

function attachTrackingUpdates(requests) {
    const active = requests.filter(request =>
        request.driverId && request.status === "In Transit"
    );
    active.forEach(request => refreshTracking(request._id));
    if (active.length) {
        trackingIntervals.push(window.setInterval(() => {
            active.forEach(request => refreshTracking(request._id));
        }, 10000));
    }

    content.querySelectorAll("[data-track-id]").forEach(button => {
        button.addEventListener("click", () => refreshTracking(button.dataset.trackId));
    });
}

async function refreshTracking(requestId) {
    const target = Array.from(content.querySelectorAll("[data-tracking-for]"))
        .find(element => element.dataset.trackingFor === String(requestId));
    if (!target) return;
    try {
        const tracking = await api(`/api/requests/${encodeURIComponent(requestId)}/tracking`);
        const location = tracking.location || {};
        const locationText = Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
            ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
            : "Waiting for the driver’s first GPS update";
        const updatedText = location.updatedAt
            ? new Date(location.updatedAt).toLocaleTimeString()
            : "Not started";
        const route = tracking.route || {};
        const driver = tracking.driver || {};
        target.textContent = `Driver: ${driver.name || "—"} · Vehicle: ${driver.vehicleNumber || "—"} · Phone: ${driver.phone || "—"} · Location: ${locationText} · Updated: ${updatedText}${route.id ? ` · ${route.id}: ${Number(route.distanceKm).toFixed(1)} km, about ${route.durationMinutes} min` : ""}`;
        if (window.L && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
            const mapId = `tracking-map-${String(requestId)}`;
            let map = trackingMaps.get(mapId);
            let marker = trackingMarkers.get(mapId);
            if (!map && document.getElementById(mapId)) {
                map = window.L.map(mapId, { zoomControl: false })
                    .setView([location.latitude, location.longitude], 14);
                window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "&copy; OpenStreetMap contributors"
                }).addTo(map);
                trackingMaps.set(mapId, map);
            }
            if (map) {
                if (route.geometry && !trackingRouteLayers.has(mapId)) {
                    const routeLayer = window.L.geoJSON(route.geometry, {
                        style: { color: "#087f5b", weight: 5 }
                    }).addTo(map);
                    trackingRouteLayers.set(mapId, routeLayer);
                    const bounds = routeLayer.getBounds();
                    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
                }
                if (!marker) {
                    marker = window.L.marker([location.latitude, location.longitude]).addTo(map);
                    trackingMarkers.set(mapId, marker);
                } else {
                    marker.setLatLng([location.latitude, location.longitude]);
                }
                if (!trackingRouteLayers.has(mapId)) {
                    map.setView([location.latitude, location.longitude], map.getZoom());
                }
            }
        }
    } catch (error) {
        target.textContent = error.message;
    }
}

function cleanupTrackingMaps() {
    trackingMaps.forEach(map => map.remove());
    trackingMaps.clear();
    trackingMarkers.clear();
    trackingRouteLayers.clear();
    if (driverMap) driverMap.remove();
    driverMap = null;
    driverMapMarker = null;
}

function intro(title, description) {
    return `<div class="page-intro"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>`;
}

function demoBanner() {
    return `<div class="demo-banner"><strong>Prototype notice:</strong> This workspace uses demonstration coordination data. It does not determine medical eligibility, donor-recipient matching, organ allocation, or clinical transport decisions.</div>`;
}

function metrics(items) {
    return `<div class="metric-grid">${items.map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join("")}</div>`;
}

function countStatus(requests, status) {
    return requests.filter(request => request.status === status).length;
}

function statusClass(status = "") {
    return String(status).toLowerCase().replaceAll(" ", "-");
}

async function submitForm(button, action) {
    if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
    }
    try {
        await action();
    } catch (error) {
        showNotice(error.message, true);
        if (button) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    }
}

function uploadPatientRequest(formData, onProgress) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/patient/requests");
        request.setRequestHeader("Authorization", "Bearer " + token);
        request.timeout = 120000;
        request.upload.addEventListener("progress", event => {
            if (event.lengthComputable) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        });
        request.addEventListener("load", () => {
            let result = {};
            try {
                result = JSON.parse(request.responseText);
            } catch (error) {
                reject(new Error("The server returned an invalid upload response."));
                return;
            }
            if (request.status === 401) {
                localStorage.removeItem("organroute.token");
                localStorage.removeItem("organroute.user");
                window.location.replace("../index.html");
                reject(new Error("Your session expired. Please sign in again."));
                return;
            }
            if (request.status < 200 || request.status >= 300 || result.success === false) {
                reject(new Error(result.message || `Upload failed (${request.status}).`));
                return;
            }
            resolve(result);
        });
        request.addEventListener("error", () => reject(new Error("Network error while uploading documents.")));
        request.addEventListener("timeout", () => reject(new Error("Document upload timed out. Please try again.")));
        request.send(formData);
    });
}

async function api(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {})
        },
        ...(options.body ? { body: isFormData ? options.body : JSON.stringify(options.body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        localStorage.removeItem("organroute.token");
        localStorage.removeItem("organroute.user");
        window.location.replace("../index.html");
        throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }
    return data;
}

function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle("error", isError);
    notice.hidden = false;
}

function hideNotice() {
    notice.hidden = true;
    notice.textContent = "";
    notice.classList.remove("error");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}
