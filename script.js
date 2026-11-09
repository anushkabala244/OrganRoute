const API_BASE = "/api";
const COUNTRY_CODES = [
    ["IN", "India", "+91"],
    ["US", "United States", "+1"],
    ["GB", "United Kingdom", "+44"],
    ["CA", "Canada", "+1"],
    ["AU", "Australia", "+61"],
    ["NZ", "New Zealand", "+64"],
    ["AE", "United Arab Emirates", "+971"],
    ["SA", "Saudi Arabia", "+966"],
    ["SG", "Singapore", "+65"],
    ["MY", "Malaysia", "+60"],
    ["PK", "Pakistan", "+92"],
    ["BD", "Bangladesh", "+880"],
    ["LK", "Sri Lanka", "+94"],
    ["NP", "Nepal", "+977"],
    ["PH", "Philippines", "+63"],
    ["ZA", "South Africa", "+27"],
    ["NG", "Nigeria", "+234"],
    ["KE", "Kenya", "+254"],
    ["DE", "Germany", "+49"],
    ["FR", "France", "+33"],
    ["IT", "Italy", "+39"],
    ["ES", "Spain", "+34"],
    ["NL", "Netherlands", "+31"],
    ["IE", "Ireland", "+353"],
    ["BR", "Brazil", "+55"],
    ["MX", "Mexico", "+52"],
    ["JP", "Japan", "+81"],
    ["KR", "South Korea", "+82"],
    ["CN", "China", "+86"],
    ["HK", "Hong Kong", "+852"],
    ["TR", "Türkiye", "+90"]
];
const HOSPITAL_CITIES_BY_STATE = {
    "andaman and nicobar islands": ["Port Blair"],
    "andhra pradesh": ["Amaravati", "Guntur", "Tirupati", "Vijayawada", "Visakhapatnam"],
    "arunachal pradesh": ["Itanagar", "Naharlagun"],
    assam: ["Dibrugarh", "Guwahati", "Silchar"],
    bihar: ["Bhagalpur", "Gaya", "Patna"],
    chandigarh: ["Chandigarh"],
    chhattisgarh: ["Bilaspur", "Raipur"],
    "dadra and nagar haveli and daman and diu": ["Daman", "Silvassa"],
    delhi: ["Delhi", "New Delhi"],
    goa: ["Margao", "Panaji"],
    gujarat: ["Ahmedabad", "Gandhinagar", "Rajkot", "Surat", "Vadodara"],
    haryana: ["Faridabad", "Gurugram", "Hisar", "Rohtak"],
    "himachal pradesh": ["Dharamshala", "Shimla", "Solan"],
    "jammu and kashmir": ["Jammu", "Srinagar"],
    jharkhand: ["Bokaro", "Dhanbad", "Ranchi"],
    karnataka: ["Bengaluru", "Hubballi", "Mangaluru", "Mysuru"],
    kerala: ["Kochi", "Kozhikode", "Thiruvananthapuram"],
    ladakh: ["Leh"],
    lakshadweep: ["Kavaratti"],
    "madhya pradesh": ["Bhopal", "Gwalior", "Indore", "Jabalpur"],
    maharashtra: ["Mumbai", "Nagpur", "Nashik", "Pune"],
    manipur: ["Imphal"],
    meghalaya: ["Shillong"],
    mizoram: ["Aizawl"],
    nagaland: ["Dimapur", "Kohima"],
    odisha: ["Bhubaneswar", "Cuttack", "Rourkela"],
    puducherry: ["Karaikal", "Puducherry"],
    punjab: ["Amritsar", "Jalandhar", "Ludhiana"],
    rajasthan: ["Ajmer", "Jaipur", "Jodhpur", "Kota", "Udaipur"],
    sikkim: ["Gangtok"],
    "tamil nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"],
    telangana: ["Hyderabad", "Warangal"],
    tripura: ["Agartala"],
    "uttar pradesh": ["Agra", "Ghaziabad", "Kanpur", "Lucknow", "Noida", "Varanasi"],
    uttarakhand: ["Dehradun", "Haridwar", "Rishikesh"],
    "west bengal": ["Asansol", "Durgapur", "Kolkata", "Siliguri"]
};

document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const internalRole = params.get("internal");
    const resetToken = params.get("passwordReset");
    if (internalRole === "driver" || internalRole === "platform-admin") {
        showAuthForm(internalRole === "driver" ? "driver" : "admin", "login");
    } else if (resetToken) {
        showResetPasswordForm(resetToken);
    }

    document.querySelectorAll('[href="#login"], [data-open-auth="login"]').forEach((button) => {
        button.addEventListener("click", (event) => {
            if (button.matches("a")) event.preventDefault();
            showAccountSelection("login");
        });
    });

    document.querySelectorAll('[href="#register"], [data-open-auth="register"]').forEach((button) => {
        button.addEventListener("click", (event) => {
            if (button.matches("a")) event.preventDefault();
            showAccountSelection("register");
        });
    });

});

function showAccountSelection(mode, existingOverlay = null) {
    const overlay = existingOverlay || createOverlay();
    const options = [
        ["patient", "Patient / Family", "Requests, status updates and hospital routing"],
        ["hospital", "Hospital Administrator", "Manage requests and verified hospital details"]
    ];

    overlay.innerHTML = `
        <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div class="auth-modal-toolbar">
                <span aria-hidden="true"></span>
                <button class="auth-close" type="button" aria-label="Close">&times;</button>
            </div>
            <span class="eyebrow">${mode === "login" ? "ACCOUNT LOGIN" : "ACCOUNT REGISTRATION"}</span>
            <h2 id="auth-title">${mode === "login" ? "Choose an account to sign in" : "Choose an account to create"}</h2>
            <p class="auth-description">${mode === "login"
                ? "Select the account type you want to sign in to."
                : "Select the account type you want to register."}</p>
            ${options.map(([role, title, description]) => `
                <button class="account-option" type="button" data-role="${role}">
                    <span class="option-icon" aria-hidden="true">${role === "patient" ? "♡" : role === "hospital" ? "✚" : "⌘"}</span>
                    <span><strong>${title}</strong><small>${description}</small></span>
                    <span class="option-arrow" aria-hidden="true">→</span>
                </button>
            `).join("")}
            ${mode === "register" ? `<p class="auth-note">Administrator accounts are provisioned by the platform operator.</p>` : ""}
        </section>`;

    if (!existingOverlay) attachOverlay(overlay);
    else overlay.querySelector("[data-role]")?.focus();
    overlay.querySelectorAll("[data-role]").forEach((button) => {
        button.addEventListener("click", () => {
            showAuthForm(button.dataset.role, mode, "", overlay);
        });
    });
}

function showAuthForm(role, mode, message = "", existingOverlay = null) {
    const isRegister = mode === "register";
    const isHospital = role === "hospital";
    const isAdmin = role === "admin";
    const roleLabel = {
        patient: "PATIENT / FAMILY",
        hospital: "HOSPITAL ADMINISTRATOR",
        driver: "DELIVERY DRIVER",
        admin: "PLATFORM ADMINISTRATOR"
    }[role];
    const overlay = existingOverlay || createOverlay();

    overlay.innerHTML = `
        <section class="auth-modal auth-form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div class="auth-modal-toolbar">
                <button class="text-button auth-back" type="button">Back to account types</button>
                <button class="auth-close" type="button" aria-label="Close">&times;</button>
            </div>
            <span class="eyebrow">${roleLabel}</span>
            <h2 id="auth-title">${isRegister ? "Create your account" : "Welcome back"}</h2>
            <p class="auth-description">${isRegister ? "Use your contact details to get started." : "Sign in with your registered email and password."}</p>
            <p class="auth-feedback" role="status" aria-live="polite">${escapeHtml(message)}</p>
            <form id="auth-form">
                ${isRegister ? `
                    <label for="auth-name">Full name</label>
                    <input id="auth-name" name="name" type="text" autocomplete="name" maxlength="100" required>
                ` : ""}
                <div id="login-email-field">
                    <label for="auth-email">Email address</label>
                    <input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" required>
                </div>
                ${isRegister ? `
                    <label for="auth-phone">Mobile number</label>
                    <div class="phone-input-row">
                        <select id="auth-country-code" aria-label="Country calling code">
                            ${COUNTRY_CODES.map(([code, country, dial]) => `<option value="${dial}"${code === "IN" ? " selected" : ""}>${country} (${dial})</option>`).join("")}
                        </select>
                        <input id="auth-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="Mobile number" pattern="[0-9]{4,15}" aria-label="Mobile number without country code" required>
                    </div>
                    <label for="verification-method">Send verification code to</label>
                    <select id="verification-method" name="verificationMethod" required>
                        <option value="email">Email address</option>
                        <option value="phone">Mobile number (SMS)</option>
                    </select>
                ` : ""}
                ${isRegister && isHospital ? `
                    <label for="hospital-name">Hospital name</label>
                    <input id="hospital-name" name="hospitalName" type="text" maxlength="120" required>
                    <label for="hospital-address">Hospital address</label>
                    <input id="hospital-address" name="address" type="text" maxlength="240" autocomplete="street-address" required>
                    <label for="hospital-registration">Hospital registration / license number</label>
                    <input id="hospital-registration" name="registrationNumber" type="text" maxlength="80" required>
                    <label for="hospital-country">Country</label>
                    <input id="hospital-country" name="country" type="text" maxlength="100" value="India" autocomplete="country-name" required>
                    <label for="hospital-city">City</label>
                    <input id="hospital-city" name="city" type="text" maxlength="100" list="hospital-city-options" required>
                    <datalist id="hospital-city-options"></datalist>
                    <label for="hospital-state">State</label>
                    <input id="hospital-state" name="state" type="text" maxlength="100" list="hospital-state-options" required>
                    <datalist id="hospital-state-options">${Object.keys(HOSPITAL_CITIES_BY_STATE).map(state => `<option value="${escapeHtml(state.replace(/\b\w/g, letter => letter.toUpperCase()))}"></option>`).join("")}</datalist>
                    <p class="auth-note">Select a state to see city suggestions. You can enter another city if it is not listed.</p>
                    <label for="hospital-postal-code">PIN code / postal code</label>
                    <input id="hospital-postal-code" name="postalCode" type="text" maxlength="20" autocomplete="postal-code" required>
                    <label for="hospital-speciality">Speciality</label>
                    <input id="hospital-speciality" name="speciality" type="text" maxlength="100" value="Multi-speciality">
                ` : ""}
                <label for="auth-password">Password</label>
                <input id="auth-password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="8" maxlength="128" required>
                ${isRegister ? `
                    <label for="auth-confirm-password">Confirm password</label>
                    <input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
                ` : ""}
                <button class="btn btn-primary auth-submit" type="submit" id="auth-submit">${isRegister ? "Create account" : "Sign in"} <span aria-hidden="true">→</span></button>
            </form>
            <p class="auth-switch">
                ${isRegister ? "Already have an account?" : "Don't have an account?"}
                ${isAdmin || role === "driver" ? "" : `<button class="text-button" type="button" id="switch-mode">${isRegister ? "Login" : "Sign Up"}</button>`}
            </p>
            ${!isRegister ? `<button class="text-button forgot-password-link" type="button" id="forgot-password">Forgot Password?</button>` : ""}
            <p class="auth-note">${isHospital
                ? "Hospital accounts require administrator approval after contact verification."
                : role === "driver"
                    ? "Driver accounts require approval from the selected hospital after contact verification."
                    : "Do not use OrganRoute for emergencies or clinical decisions."}</p>
        </section>`;

    if (!existingOverlay) attachOverlay(overlay);
    else overlay.querySelector("input")?.focus();
    const hospitalState = overlay.querySelector("#hospital-state");
    const hospitalCityOptions = overlay.querySelector("#hospital-city-options");
    if (hospitalState && hospitalCityOptions) {
        const updateCityOptions = () => {
            const cities = HOSPITAL_CITIES_BY_STATE[
                hospitalState.value.trim().toLowerCase()
            ] || [];
            hospitalCityOptions.replaceChildren(
                ...cities.map(city => new Option(city, city))
            );
        };
        hospitalState.addEventListener("input", updateCityOptions);
        updateCityOptions();
    }
    overlay.querySelector(".auth-back")?.addEventListener("click", () => {
        if (isAdmin || role === "driver") {
            window.location.assign("index.html");
            return;
        }
        showAccountSelection(mode, overlay);
    });
    if (isRegister && role === "driver" && overlay.querySelector("#driver-hospital")) {
        const hospitalSelect = overlay.querySelector("#driver-hospital");
        apiRequest(`${API_BASE}/auth/driver-hospitals`)
            .then((result) => {
                const hospitals = result.hospitals || [];
                hospitalSelect.replaceChildren(new Option("Select your verified hospital", ""));
                hospitals.forEach((hospital) => {
                    hospitalSelect.add(new Option(
                        `${hospital.name} · ${hospital.city}, ${hospital.state}`,
                        hospital.id
                    ));
                });
                if (!hospitals.length) {
                    hospitalSelect.replaceChildren(new Option("No verified hospitals available", ""));
                    showFeedback(overlay, "A hospital must be verified before drivers can register.");
                }
            })
            .catch((error) => {
                hospitalSelect.replaceChildren(new Option("Unable to load hospitals", ""));
                showFeedback(overlay, error.message, true);
            });
    }
    if (!isRegister && !isAdmin && overlay.querySelector("#login-method")) {
        const method = overlay.querySelector("#login-method");
        const emailField = overlay.querySelector("#login-email-field");
        const emailInput = overlay.querySelector("#auth-email");
        const phoneField = overlay.querySelector("#login-phone-field");
        const phoneInput = overlay.querySelector("#login-phone");
        const setLoginMethod = () => {
            const usePhone = method.value === "phone";
            emailField.hidden = usePhone;
            emailInput.required = !usePhone;
            emailInput.disabled = usePhone;
            phoneField.hidden = !usePhone;
            phoneInput.required = usePhone;
            phoneInput.disabled = !usePhone;
        };
        method.addEventListener("change", setLoginMethod);
        setLoginMethod();
    }

    overlay.querySelector("#forgot-password")?.addEventListener("click", () => {
        showForgotPasswordForm(overlay, overlay.querySelector("#auth-email").value.trim(), role);
    });
    overlay.querySelector("#switch-mode")?.addEventListener("click", () => {
        showAuthForm(role, isRegister ? "login" : "register", "", overlay);
    });

    overlay.querySelector("#auth-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        if (isRegister) {
            if (payload.password !== payload.confirmPassword) {
                showFeedback(overlay, "Passwords do not match.", true);
                return;
            }
            delete payload.confirmPassword;
            const countryCode = overlay.querySelector("#auth-country-code").value;
            const nationalNumber = form.elements.namedItem("phone").value.replace(/\D/g, "");
            payload.phone = `${countryCode}${nationalNumber}`;
        } else {
            payload.email = String(payload.email || "").trim().toLowerCase();
        }
        const submit = overlay.querySelector("#auth-submit");
        setBusy(submit, true, isRegister ? "Creating account…" : "Signing in…");

        try {
            if (isRegister) {
                payload.role = role;
                const result = await apiRequest(`${API_BASE}/auth/register`, {
                    method: "POST",
                    body: payload
                });
                showVerification(overlay, {
                    role,
                    email: payload.email,
                    phone: payload.phone,
                    password: payload.password,
                    message: result.message,
                    verificationMethod: result.verificationMethod || payload.verificationMethod,
                    developmentOtp: result.developmentOtp
                });
                return;
            }

            const result = isAdmin
                ? await apiRequest(`${API_BASE}/admin/login`, {
                    method: "POST",
                    body: { email: payload.email, password: payload.password }
                })
                : await apiRequest(`${API_BASE}/${role === "driver" ? "auth/driver/login" : "auth/login"}`, {
                    method: "POST",
                    body: { email: payload.email, password: payload.password, role }
                });

            const user = isAdmin ? result.admin : result.user;
            if (!user || user.role !== role) {
                throw new Error("The authentication service returned an account for a different role.");
            }
            storeSession(result.token, user);
            window.location.assign(dashboardPathFor(user.role));
        } catch (error) {
            showFeedback(overlay, error.message, true);
            setBusy(submit, false);
        }
    });
}

function showVerification(overlay, details) {
    const modal = overlay.querySelector(".auth-modal");
    const isEmail = details.verificationMethod === "email";
    const destination = isEmail ? details.email : details.phone;
    modal.innerHTML = `
        <div class="auth-modal-toolbar">
            <span aria-hidden="true"></span>
            <button class="auth-close" type="button" aria-label="Close">&times;</button>
        </div>
        <span class="eyebrow">CONTACT VERIFICATION</span>
        <h2>Verify your ${isEmail ? "email" : "phone"}</h2>
        <p class="auth-description">${escapeHtml(details.message || `Enter the code sent to ${destination}.`)}</p>
        ${details.developmentOtp ? `
            <div class="development-otp">
                <strong>Local development codes</strong>
                <span>${isEmail ? "Email" : "SMS"}: <code>${escapeHtml(details.developmentOtp.code)}</code></span>
                <small>No message was sent. This code is available only in explicitly enabled non-production mode.</small>
            </div>
        ` : ""}
        <p class="auth-feedback" role="status" aria-live="polite"></p>
        <form id="verification-form">
            <label for="verification-otp">${isEmail ? "Email" : "SMS"} verification code</label>
            <input id="verification-otp" name="otp" inputmode="numeric" pattern="${isEmail ? "[0-9]{6}" : "[0-9]{4,10}"}" minlength="${isEmail ? "6" : "4"}" maxlength="${isEmail ? "6" : "10"}" autocomplete="one-time-code" required>
            <button class="btn btn-primary auth-submit" type="submit" id="verify-submit">Verify and continue</button>
        </form>
        <p class="auth-note">The code was sent to ${escapeHtml(destination)}. Codes expire after a short time.</p>`;

    modal.querySelector("#verification-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const submit = modal.querySelector("#verify-submit");
        const values = new FormData(form);
        setBusy(submit, true, "Verifying…");

        try {
            if (isEmail) {
                await apiRequest(`${API_BASE}/auth/verify-email`, {
                    method: "POST",
                    body: { email: details.email, otp: values.get("otp") }
                });
            } else {
                await apiRequest(`${API_BASE}/auth/verify-phone`, {
                    method: "POST",
                    body: { phone: details.phone, otp: values.get("otp") }
                });
            }

            if (["hospital", "driver"].includes(details.role)) {
                const approvalOwner = details.role === "hospital"
                    ? "the platform administrator"
                    : "your selected hospital";
                showFeedback(
                    modal,
                    `Contact verified. Your account is waiting for approval from ${approvalOwner}. You can sign in now to view its review status; protected tools unlock after approval.`
                );
                modal.querySelector("#verification-form").remove();
                modal.querySelector(".auth-note").textContent =
                    "You can close this window. Your account details are saved.";
                const signInButton = document.createElement("button");
                signInButton.className = "text-button";
                signInButton.type = "button";
                signInButton.textContent = "Go to sign in";
                signInButton.addEventListener("click", () => {
                    closeOverlay(overlay);
                    showAuthForm(details.role, "login");
                });
                modal.append(signInButton);
                return;
            }

            showFeedback(modal, "Contact verified. Signing you in…");
            const result = await apiRequest(`${API_BASE}/auth/login`, {
                method: "POST",
                body: { email: details.email, password: details.password, role: details.role }
            });
            if (result.user?.role !== details.role) {
                throw new Error("The authentication service returned an account for a different role.");
            }
            storeSession(result.token, result.user);
            window.location.assign(dashboardPathFor(result.user.role));
        } catch (error) {
            showFeedback(modal, error.message, true);
            setBusy(submit, false);
        }
    });
}

function showForgotPasswordForm(overlay, email = "", role = "patient") {
    const modal = overlay.querySelector(".auth-modal");
    modal.innerHTML = `
        <div class="auth-modal-toolbar">
            <button class="text-button auth-back" type="button">Back to sign in</button>
            <button class="auth-close" type="button" aria-label="Close">&times;</button>
        </div>
        <span class="eyebrow">ACCOUNT RECOVERY</span>
        <h2>Forgot Password?</h2>
        <p class="auth-description">Enter the email used for your account. We will provide the next step without confirming whether an account exists.</p>
        <p class="auth-feedback" role="status" aria-live="polite"></p>
        <form id="forgot-password-form">
            <label for="reset-email">Email address</label>
            <input id="reset-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(email)}" required>
            <button class="btn btn-primary auth-submit" type="submit">Send reset link</button>
        </form>`;
    modal.querySelector(".auth-back").addEventListener("click", () => {
        showAuthForm(role, "login", "", overlay);
    });
    modal.querySelector("#forgot-password-form").addEventListener("submit", async event => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const submit = event.currentTarget.querySelector("button[type=submit]");
        setBusy(submit, true, "Sending…");
        try {
            const form = new FormData(event.currentTarget);
            const result = await apiRequest(`${API_BASE}/auth/forgot-password`, {
                method: "POST",
                body: {
                    email: String(form.get("email")).trim().toLowerCase(),
                    role
                }
            });
            showFeedback(modal, result.message);
            modal.querySelector("[data-development-reset-link]")?.remove();
            if (result.developmentMode && result.developmentResetUrl) {
                const developmentLink = document.createElement("p");
                developmentLink.className = "development-otp";
                developmentLink.dataset.developmentResetLink = "";
                const label = document.createElement("strong");
                label.textContent = "Local development reset link";
                const link = document.createElement("a");
                link.href = result.developmentResetUrl;
                link.textContent = "Open password reset form";
                developmentLink.append(label, document.createElement("br"), link);
                modal.append(developmentLink);
            }
            setBusy(submit, false, "Send reset link");
        } catch (error) {
            showFeedback(modal, error.message, true);
            setBusy(submit, false, "Send reset link");
        }
    });
}

function showResetPasswordForm(token, existingOverlay = null) {
    const overlay = existingOverlay || createOverlay();
    overlay.innerHTML = `
        <section class="auth-modal auth-form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div class="auth-modal-toolbar">
                <span aria-hidden="true"></span>
                <button class="auth-close" type="button" aria-label="Close">&times;</button>
            </div>
            <span class="eyebrow">ACCOUNT RECOVERY</span>
            <h2 id="auth-title">Set a new password</h2>
            <p class="auth-feedback" role="status" aria-live="polite"></p>
            <form id="reset-password-form">
                <label for="new-password">New password</label>
                <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
                <label for="confirm-new-password">Confirm new password</label>
                <input id="confirm-new-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
                <button class="btn btn-primary auth-submit" type="submit">Reset password</button>
            </form>
        </section>`;
    if (!existingOverlay) attachOverlay(overlay);
    overlay.querySelector("#reset-password-form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const values = new FormData(form);
        const password = String(values.get("password"));
        if (password !== values.get("confirmPassword")) {
            showFeedback(overlay, "Passwords do not match.", true);
            return;
        }
        const submit = form.querySelector("button[type=submit]");
        setBusy(submit, true, "Updating…");
        try {
            const result = await apiRequest(`${API_BASE}/auth/reset-password`, {
                method: "POST",
                body: {
                    token,
                    password,
                    confirmPassword: String(values.get("confirmPassword"))
                }
            });
            form.remove();
            showFeedback(overlay, result.message);
            const login = document.createElement("button");
            login.className = "text-button";
            login.type = "button";
            login.textContent = "Return to Login";
            login.addEventListener("click", () => {
                closeOverlay(overlay);
                const resetRole = new URLSearchParams(window.location.search).get("role");
                window.history.replaceState(null, "", window.location.pathname);
                if (["patient", "hospital", "driver", "admin"].includes(resetRole)) {
                    showAuthForm(resetRole, "login");
                } else {
                    showAccountSelection("login");
                }
            });
            overlay.querySelector(".auth-modal").append(login);
        } catch (error) {
            showFeedback(overlay, error.message, true);
            setBusy(submit, false, "Reset password");
        }
    });
}

function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    return overlay;
}

function attachOverlay(overlay) {
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    overlay.addEventListener("click", (event) => {
        if (event.target.closest?.(".auth-close")) {
            closeOverlay(overlay);
            return;
        }
        if (event.target === overlay) closeOverlay(overlay);
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeOverlay(overlay);
    });
    (overlay.querySelector("input") || overlay.querySelector("[data-role]"))?.focus();
}

function closeOverlay(overlay) {
    overlay.remove();
    if (!document.querySelector(".auth-overlay")) document.body.classList.remove("modal-open");
}

function dashboardPathFor(role) {
    const dashboardPaths = {
        patient: "dashboards/patient.html",
        hospital: "dashboards/hospital/hospital.html",
        driver: "dashboards/portal.html",
        admin: "dashboards/portal.html"
    };
    return dashboardPaths[role] || "index.html";
}

function showFeedback(container, message, isError = false) {
    const feedback = container.querySelector(".auth-feedback");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("error", isError);
}

function setBusy(button, busy, label = "") {
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    if (label) button.textContent = label;
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        method: options.method || "GET",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }
    return data;
}

function storeSession(token, user) {
    localStorage.setItem("organroute.token", token);
    localStorage.setItem("organroute.user", JSON.stringify(user));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}
