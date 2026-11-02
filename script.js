
// OrganRoute: Frontend interactions

document.addEventListener("DOMContentLoaded", () => {
    // Account selection buttons on the homepage
    const accountButtons = document.querySelectorAll("[data-account]");

    accountButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const accountType = button.dataset.account;
            showAuthPage(accountType, "register");
        });
    });

    // Login button in the navigation
    const loginButton = document.querySelector('.nav-buttons a[href="#login"]');

    if (loginButton) {
        loginButton.addEventListener("click", (event) => {
            event.preventDefault();
            showAccountSelection("login");
        });
    }

    // Get Started button
    const getStartedButton = document.querySelector(
        '.nav-buttons a[href="#register"]'
    );

    if (getStartedButton) {
        getStartedButton.addEventListener("click", (event) => {
            event.preventDefault();
            showAccountSelection("register");
        });
    }
});

// Display account type selection
function showAccountSelection(mode) {
    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";

    overlay.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="Close">&times;</button>

            <span class="eyebrow">WELCOME TO ORGANROUTE</span>
            <h2>${mode === "login" ? "Welcome Back" : "Create Your Account"}</h2>

            <p class="auth-description">
                Choose your account type to continue.
            </p>

            <button class="account-option" data-type="patient">
                <span class="option-icon">♡</span>
                <span>
                    <strong>Patient / Family</strong>
                    <small>Patient support, documents and hospital search</small>
                </span>
                <span class="option-arrow">→</span>
            </button>

            <button class="account-option" data-type="hospital">
                <span class="option-icon">✚</span>
                <span>
                    <strong>Hospital / Staff</strong>
                    <small>Hospital registration and staff access</small>
                </span>
                <span class="option-arrow">→</span>
            </button>

            <p class="auth-switch">
                This is a frontend demonstration. Real authentication
                and OTP delivery will be added with the backend.
            </p>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");

    overlay.querySelector(".auth-close").addEventListener("click", () => {
        overlay.remove();
        document.body.classList.remove("modal-open");
    });

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.remove();
            document.body.classList.remove("modal-open");
        }
    });

    overlay.querySelectorAll("[data-type]").forEach((button) => {
        button.addEventListener("click", () => {
            const accountType = button.dataset.type;
            overlay.remove();
            document.body.classList.remove("modal-open");
            showAuthPage(accountType, mode);
        });
    });
}

// Display registration or login form for the selected account type
function showAuthPage(accountType, mode) {
    const isPatient = accountType === "patient";
    const accountName = isPatient ? "Patient / Family" : "Hospital / Staff";

    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";

    overlay.innerHTML = `
        <div class="auth-modal auth-form-modal">
            <button class="auth-close" aria-label="Close">&times;</button>

            <span class="eyebrow">${accountName.toUpperCase()}</span>

            <h2>
                ${mode === "register" ? "Create Your Account" : "Welcome Back"}
            </h2>

            <p class="auth-description">
                ${
                    mode === "register"
                        ? "Enter your details to get started."
                        : "Enter your registered email or mobile number."
                }
            </p>

            <form id="auth-form">
                ${
                    mode === "register"
                        ? `
                            <label for="full-name">Full Name</label>
                            <input
                                id="full-name"
                                name="fullName"
                                type="text"
                                placeholder="Enter your full name"
                                autocomplete="name"
                                required
                            >
                        `
                        : ""
                }

                <label for="email">Email Address</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    ${mode === "register" ? "required" : ""}
                >

                <label for="phone">Mobile Number</label>
                <input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="Enter your mobile number"
                    autocomplete="tel"
                    ${mode === "register" ? "required" : ""}
                >

                ${
                    mode === "register" && !isPatient
                        ? `
                            <label for="hospital-name">Hospital Name</label>
                            <input
                                id="hospital-name"
                                name="hospitalName"
                                type="text"
                                placeholder="Enter hospital name"
                                required
                            >

                            <label for="staff-role">Your Role</label>
                            <select id="staff-role" name="staffRole" required>
                                <option value="">Select your role</option>
                                <option value="representative">Hospital Representative</option>
                                <option value="staff">Hospital Staff</option>
                            </select>
                        `
                        : ""
                }

                ${
                    mode === "register" && isPatient
                        ? `
                            <label for="patient-role">Registering As</label>
                            <select id="patient-role" name="patientRole" required>
                                <option value="">Choose an option</option>
                                <option value="patient">Patient</option>
                                <option value="family">Family Member</option>
                            </select>
                        `
                        : ""
                }

                <button class="btn btn-primary auth-submit" type="submit">
                    ${mode === "register" ? "Continue to Verification" : "Continue to Verification"}
                    <span>→</span>
                </button>
            </form>

            <p class="auth-switch">
                ${
                    mode === "register"
                        ? `Already have an account?
                           <button class="text-button" id="switch-mode">Login</button>`
                        : `New to OrganRoute?
                           <button class="text-button" id="switch-mode">Register</button>`
                }
            </p>

            <p class="auth-note">
                Frontend prototype only. No real account will be created
                and no email or SMS code will be sent yet.
            </p>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");

    const closeModal = () => {
        overlay.remove();
        document.body.classList.remove("modal-open");
    };

    overlay.querySelector(".auth-close").addEventListener("click", closeModal);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeModal();
    });

    overlay.querySelector("#switch-mode").addEventListener("click", () => {
        closeModal();
        showAuthPage(
            accountType,
            mode === "register" ? "login" : "register"
        );
    });

    const form = overlay.querySelector("#auth-form");
    const emailInput = form.elements.namedItem("email");
    const phoneInput = form.elements.namedItem("phone");

    if (mode === "login") {
        const clearContactError = () => emailInput.setCustomValidity("");
        emailInput.addEventListener("input", clearContactError);
        phoneInput.addEventListener("input", clearContactError);
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (
            mode === "login" &&
            !emailInput.value.trim() &&
            !phoneInput.value.trim()
        ) {
            emailInput.setCustomValidity(
                "Enter your registered email address or mobile number."
            );
            emailInput.reportValidity();
            return;
        }

        emailInput.setCustomValidity("");

        if (!form.reportValidity()) return;

        showOtpDemo(overlay, accountType, mode);
    });
}

// Demonstration of the future OTP verification screen
function showOtpDemo(overlay, accountType, mode) {
    const email = overlay.querySelector('[name="email"]').value.trim();
    const phone = overlay.querySelector('[name="phone"]').value.trim();

    overlay.querySelector(".auth-modal").innerHTML = `
        <button class="auth-close" aria-label="Close">&times;</button>

        <span class="eyebrow">IDENTITY VERIFICATION</span>
        <h2>Verify Your Contact</h2>

        <p class="auth-description">
            Your next step will be to verify your email address or mobile
            number before accessing your account.
        </p>

        <div class="demo-info">
            ${
                email
                    ? `<strong>Email</strong><span>${escapeHtml(email)}</span>`
                    : ""
            }
            ${
                phone
                    ? `<strong>Mobile</strong><span>${escapeHtml(phone)}</span>`
                    : ""
            }
        </div>

        <p class="auth-note">
            This is a design preview only. A real OTP has not been sent.
            Email/SMS verification will be connected after backend setup.
        </p>

        <button class="btn btn-primary auth-submit" id="back-to-form">
            Back to Form
        </button>
    `;

    overlay.querySelector(".auth-close").addEventListener("click", () => {
        overlay.remove();
        document.body.classList.remove("modal-open");
    });

    overlay.querySelector("#back-to-form").addEventListener("click", () => {
        overlay.remove();
        document.body.classList.remove("modal-open");
        showAuthPage(accountType, mode);
    });
}

// Escape user-provided text before placing it in HTML
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}
