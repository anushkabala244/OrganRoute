# OrganRoute

OrganRoute is an academic demonstration of patient requests, hospital coordination, private synthetic-document review, and delivery routing. It is not a medical record system and must not be used for clinical decisions, eligibility, compatibility, or organ allocation.

## Stack

- Static HTML, CSS, and JavaScript frontend
- Express and Mongoose backend
- MongoDB
- JWT authentication and bcrypt password hashing
- Leaflet, OpenStreetMap, and OSRM route alternatives
- Python FastAPI Mimi assistant in `chatbot/`, exposed through the Node API

## Run locally

1. Configure `backend/.env` from `backend/.env.example`.
2. From the repository root, start the backend:

   ```sh
   npm --prefix backend start
   ```

   The backend serves the frontend on port 5050. `npm start` generates missing fictional sample PDFs in the private upload directory before starting the API.
3. Open `http://localhost:5050/index.html`.
4. Start Mimi's FastAPI service in a separate terminal:

   ```sh
   cd chatbot
   python3 -m pip install -r requirements.txt
   uvicorn app:app --reload --port 8000
   ```

   The floating Mimi widget is available on the landing page and the shared,
   role-aware dashboard. It calls the existing Node `POST /api/chat` proxy,
   which forwards questions to FastAPI at `http://127.0.0.1:8000/chat`. The FAQ
   answers work without an OpenAI key; the widget shows an error if the service
   is unavailable.

## Environment

See `backend/.env.example`. The backend needs a MongoDB URI and a long random `JWT_SECRET`. Set `APP_BASE_URL` to the public base URL so password recovery and driver invitation links return to this deployment. Email OTP and password recovery use `EMAIL_USER` and `EMAIL_APP_PASSWORD`. SMS OTP uses Twilio Verify credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`). SMS is not sent unless those credentials are configured. `DEV_OTP_MODE=true` and `DEV_PASSWORD_RESET_MODE=true` are development-only switches; the latter returns an explicitly labelled one-time reset link in the form and does not send an email.

## Account access

- Public Login and Register selectors contain only Patient / Family and Hospital Administrator.
- Public registration accepts patients and hospitals only. Hospital contact details are verified before platform approval.
- Hospitals create driver accounts from their Drivers dashboard; the driver receives a one-time email link to set a password. Hospitals can activate/deactivate drivers, and drivers can update their availability from their dashboard.
- Driver sign-in is at `/internal/driver`; platform administrator sign-in is at `/internal/platform-admin`. These entry points are not offered in the public account selector. The APIs still enforce the account role.
- All account types can request password recovery from their login form. Reset tokens are single-use, hashed at rest, and expire after one hour (driver setup links expire after 24 hours).

Route alternatives are ranked by road distance for Dijkstra's shortest-path selection. Driver route options show distance and estimated duration; these estimates do not account for live traffic or clinical transport requirements.

`PRIVATE_UPLOAD_DIR` may be set to an absolute private directory outside the web root. The default is a sibling directory named `organroute-private-uploads`. Uploaded documents and generated sample PDFs are not served as static website files.

## Fictional demo documents

Five clearly fictional demo profiles each have seven generated PDFs: a referral letter, medical summary, synthetic blood-group report, synthetic blood-test report, organ-specific investigation placeholder, demonstration consent form, and fictional identity prop. Every PDF repeats:

> DEMO DOCUMENT – FICTIONAL DATA – NOT VALID FOR MEDICAL USE

The samples use invented data, carry no clinical interpretation, and are not valid for medical, identity, eligibility, or allocation decisions. They are generated outside the public web root. The authenticated patient APIs list and preview them; patients can download them or add them to the normal multipart request upload. Uploaded samples go through the same signature checks, private storage, and hospital-review flow as other test files.

Generate or verify the sample PDFs manually:

```sh
npm --prefix backend run generate:demo-documents
```

## Request and document workflow

- Organ availability search lists verified hospitals reporting positive inventory.
- One patient request is created and shared with every verified hospital reporting that organ as available. Patients do not select a hospital at submission.
- Each hospital has an independent response and document review status.
- Hospital administrators can preview/download documents and mark each document verified or rejected; rejection requires a reason.
- Once all documents visible to that hospital are verified, its response enters `Pending Medical Review`.
- A hospital can record its own priority and a required staff-entered reason, then approve/reject with a reason for rejection.
- Patients can see each hospital's response, per-hospital document status, rejection reasons, and upload replacement documents.
- Delivery choice is shown only after a hospital response is approved.

This workflow records decisions made by authorised demo users. It does not interpret sample documents or make clinical decisions.

## Relevant API routes

All protected routes require `Authorization: Bearer <JWT>`.

- `GET /api/patient/hospitals?organType=Kidney` — verified availability listings
- `GET /api/patient/demo-documents` — fictional sample catalog
- `GET /api/patient/demo-documents/:sampleId` — authenticated PDF preview
- `POST /api/patient/requests` — one multipart patient request, fanned out to all matching verified hospitals
- `POST /api/patient/requests/:id/documents` — upload a replacement after a document rejection
- `GET /api/patient/dashboard` — patient's requests, hospital responses, and document review states
- `GET /api/hospital/dashboard` — only this hospital's requests and response
- `GET /api/hospital/requests/:id/documents/:documentId` — private hospital document download
- `PATCH /api/hospital/requests/:id/documents/:documentId/review` — verify/reject one document
- `PATCH /api/hospital/requests/:id/clinical-priority` — staff assessment and reason
- `PATCH /api/hospital/requests/:id/status` — hospital response decision
- `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` — email password recovery
- `POST /api/hospital/drivers` — create a hospital-owned driver and email a password setup link
- `PATCH /api/hospital/drivers/:id` — activate or deactivate a hospital-owned driver
- `PATCH /api/driver/availability` — update driver availability
- `GET /api/health` — API and database health

## Tests

```sh
npm --prefix backend test
node --check backend/routes/protected.js
node --check backend/services/demoDocuments.js
node --check dashboards/dashboard.js
git diff --check
```

The tests verify all 35 generated PDFs, their required page disclaimer, fictional profile catalog, private-path handling, request response modeling, and shortest-distance path selection.

## Prototype limitations

Do not upload real patient records. The private local upload directory is not an encrypted or production-grade healthcare document store. Use only synthetic PDFs/images. Route alternatives and location polling are demonstrations; OSRM public routing has service limits and no live-traffic information. Configure real external credentials before using email/SMS. Mimi can answer platform questions using its built-in FAQ without third-party AI credentials.
