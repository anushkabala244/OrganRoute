// Demo requests only. No real patient data is used.

const requests = [
    {
        id: "DEMO-101",
        type: "Information Request",
        status: "Pending"
    },
    {
        id: "DEMO-102",
        type: "Hospital Enquiry",
        status: "Reviewed"
    },
    {
        id: "DEMO-103",
        type: "General Enquiry",
        status: "Pending"
    }
];

const requestList = document.getElementById("requestList");
const filter = document.getElementById("filter");

function updateDashboard() {
    document.getElementById("total").textContent =
        requests.length;

    document.getElementById("pending").textContent =
        requests.filter(r => r.status === "Pending").length;

    document.getElementById("reviewed").textContent =
        requests.filter(r => r.status === "Reviewed").length;
}

function displayRequests() {
    const selected = filter.value;

    const filtered = requests.filter(request =>
        selected === "All" || request.status === selected
    );

    requestList.innerHTML = "";

    document.getElementById("empty").hidden =
        filtered.length !== 0;

    filtered.forEach(request => {
        const row = document.createElement("tr");

        const idCell = document.createElement("td");
        idCell.textContent = request.id;

        const typeCell = document.createElement("td");
        typeCell.textContent = request.type;

        const statusCell = document.createElement("td");
        statusCell.textContent = request.status;

        const actionCell = document.createElement("td");
        const button = document.createElement("button");

        button.textContent =
            request.status === "Pending"
                ? "Mark Reviewed"
                : "Reviewed";

        button.disabled = request.status === "Reviewed";

        button.addEventListener("click", () => {
            request.status = "Reviewed";
            updateDashboard();
            displayRequests();
        });

        actionCell.appendChild(button);

        row.append(idCell, typeCell, statusCell, actionCell);
        requestList.appendChild(row);
    });
}

filter.addEventListener("change", displayRequests);

updateDashboard();
displayRequests();