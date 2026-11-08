const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

let temporaryDirectory;
let demoDocuments;
let profiles;

before(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "organroute-demo-"));
    process.env.PRIVATE_UPLOAD_DIR = temporaryDirectory;
    demoDocuments = require("../services/demoDocuments");
    profiles = await demoDocuments.ensureDemoDocuments();
});

after(async () => {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    delete process.env.PRIVATE_UPLOAD_DIR;
});

test("generates seven synthetic document types for five fictional profiles", () => {
    assert.equal(profiles.length, 5);
    assert.ok(profiles.every(profile => profile.documents.length === 7));
    assert.ok(profiles.every(profile => profile.reference.startsWith("SAMPLE-P")));
    assert.equal(
        new Set(profiles.flatMap(profile => profile.documents.map(document => document.id))).size,
        35
    );
});

test("each generated PDF embeds the required fictional-use disclaimer twice", async () => {
    const requiredDisclaimer = Buffer.from(
        "DEMO DOCUMENT \x96 FICTIONAL DATA \x96 NOT VALID FOR MEDICAL USE",
        "latin1"
    );
    for (const profile of profiles) {
        for (const document of profile.documents) {
            const pdf = await fs.readFile(path.join(temporaryDirectory, document.fileName));
            assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
            const content = pdf.toString("latin1");
            const occurrences = content.split(requiredDisclaimer.toString("latin1")).length - 1;
            assert.ok(occurrences >= 2, `${document.fileName} is missing the disclaimer`);
            assert.ok(pdf.includes(Buffer.from("NOT VALID FOR MEDICAL USE", "ascii")));
        }
    }
});

test("keeps the sample catalog protected and exposes no filesystem paths", async () => {
    const catalog = demoDocuments.getDemoDocumentCatalog();
    assert.equal(catalog.length, 5);
    assert.ok(catalog.every(profile =>
        profile.documents.every(document => document.fictional && !document.path)
    ));
    const sample = await demoDocuments.getDemoDocument(catalog[0].documents[0].id);
    assert.equal(sample.profileName, catalog[0].name);
    assert.equal(sample.path, path.join(temporaryDirectory, sample.fileName));
});

test("stores multiple hospital responses on one patient request", async () => {
    const mongoose = require("mongoose");
    const Request = require("../models/Request");
    const request = new Request({
        patientId: new mongoose.Types.ObjectId(),
        organType: "Kidney",
        status: "Pending Verification",
        documents: [{
            originalName: "fictional-test.pdf",
            storedName: "private-fictional-test.pdf",
            mimeType: "application/pdf",
            size: 128,
            isDemoSample: true,
            demoProfileName: "Maya Verma"
        }],
        hospitalResponses: [
            { hospitalId: new mongoose.Types.ObjectId() },
            { hospitalId: new mongoose.Types.ObjectId() }
        ]
    });

    await request.validate();
    assert.equal(request.hospitalResponses.length, 2);
    assert.equal(request.documents[0].isDemoSample, true);
});
