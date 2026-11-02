
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authForm = document.getElementById("authForm");

const accountType = document.getElementById("accountType");
const nameGroup = document.getElementById("nameGroup");
const phoneGroup = document.getElementById("phoneGroup");
const hospitalGroup = document.getElementById("hospitalGroup");
const confirmGroup = document.getElementById("confirmGroup");

const documentNote = document.getElementById("documentNote");
const hospitalNote = document.getElementById("hospitalNote");

const fullName = document.getElementById("fullName");
const phone = document.getElementById("phone");
const hospitalName = document.getElementById("hospitalName");

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");

let isRegistering = false;

function setVisibility(element, visible) {
    element.classList.toggle("hidden", !visible);
}

function updateForm() {
    const isHospital = accountType.value === "hospital";

    setVisibility(nameGroup, isRegistering);
    setVisibility(phoneGroup, isRegistering);
    setVisibility(confirmGroup, isRegistering);
    setVisibility(hospitalGroup, isRegistering && isHospital);

    setVisibility(documentNote, isRegistering && !isHospital);
    setVisibility(hospitalNote, isRegistering && isHospital);

    fullName.required = isRegistering;
    phone.required = isRegistering;
    confirmPassword.required = isRegistering;
    hospitalName.required = isRegistering && isHospital;

    submitButton.textContent = isRegistering ? "Create Account" : "Login";
    message.textContent = "";
}

loginTab.addEventListener("click", () => {
    isRegistering = false;

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    updateForm();
});

registerTab.addEventListener("click", () => {
    isRegistering = true;

    registerTab.classList.add("active");
    loginTab.classList.remove("active");

    updateForm();
});

accountType.addEventListener("change", updateForm);

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    if (isRegistering && password.value !== confirmPassword.value) {
        message.textContent = "Passwords do not match.";
        return;
    }

    if (isRegistering) {
        message.textContent =
            "Registration form validated. Connect the registration API " +
            "to create a real account.";
        return;
    }

    message.textContent =
        "Login form validated. Connect the login API to authenticate " +
        "your account.";
});

updateForm();
