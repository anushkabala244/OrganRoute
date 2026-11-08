const fs = require("fs/promises");
const path = require("path");

const webRoot = path.resolve(__dirname, "../..");
const privateUploadDirectory = process.env.PRIVATE_UPLOAD_DIR ||
    path.resolve(webRoot, "..", "organroute-private-uploads");
const disclaimer = "DEMO DOCUMENT – FICTIONAL DATA – NOT VALID FOR MEDICAL USE";

const profiles = [
    { id: "demo-patient-01", name: "Maya Verma", age: 38, reference: "SAMPLE-P01", city: "Mapleford" },
    { id: "demo-patient-02", name: "Kabir Sen", age: 46, reference: "SAMPLE-P02", city: "Cedar Bay" },
    { id: "demo-patient-03", name: "Tara Iyer", age: 29, reference: "SAMPLE-P03", city: "Northbridge" },
    { id: "demo-patient-04", name: "Neel Shah", age: 55, reference: "SAMPLE-P04", city: "Willowmere" },
    { id: "demo-patient-05", name: "Anaya Bose", age: 34, reference: "SAMPLE-P05", city: "Lakehaven" }
];

const documentTypes = [
    {
        id: "doctor-referral",
        label: "Doctor referral letter",
        title: "Demonstration Referral Letter",
        lines: profile => [
            `To: OrganRoute Demonstration Review Team`,
            `Re: ${profile.name} (${profile.reference})`,
            `This fictional referral is provided only to demonstrate document upload,`,
            `private storage, and review controls in the OrganRoute prototype.`,
            `No real clinician issued this letter. No diagnosis or treatment advice is`,
            `provided. This document must not be used to make healthcare decisions.`,
            `Fictional practice: Maple & Finch Demo Clinic`,
            `Fictional clinician: Dr. Rowan Example (not a real practitioner)`,
            `Demonstration date: 08 November 2026`
        ]
    },
    {
        id: "medical-summary",
        label: "Medical summary",
        title: "Fictional Medical Summary",
        lines: profile => [
            `Demo profile: ${profile.name} | ${profile.reference}`,
            `Age shown for interface testing: ${profile.age}`,
            `Fictional city: ${profile.city}`,
            `This summary contains invented placeholder information only.`,
            `It is not a clinical record and does not describe a real person.`,
            `No diagnosis, eligibility, or care recommendation is made.`,
            `Review status: SAMPLE ONLY - NOT FOR CLINICAL REVIEW`,
            `Use this file to test private upload and document-status workflows.`
        ]
    },
    {
        id: "blood-group",
        label: "Blood group report",
        title: "Synthetic Blood Group Demonstration",
        lines: profile => [
            `Demo profile: ${profile.name} | ${profile.reference}`,
            `Invented display result: ${["A+", "B+", "O+", "AB+","O-"][Number(profile.id.slice(-2)) - 1]}`,
            `Specimen ID: SYNTHETIC-${profile.reference}`,
            `This invented result is not a laboratory measurement.`,
            `No sample was collected, tested, or processed.`,
            `Do not use this sample for compatibility, eligibility, or treatment.`,
            `Fictional laboratory: Sample Results Studio (not a real lab)`
        ]
    },
    {
        id: "blood-test",
        label: "Blood test report",
        title: "Synthetic Blood Test Demonstration",
        lines: profile => [
            `Demo profile: ${profile.name} | ${profile.reference}`,
            `All values below are invented interface-test placeholders.`,
            `Placeholder hemoglobin: 12.4 g/dL (not a measured result)`,
            `Placeholder white cell count: 6.1 x10^9/L (not a measured result)`,
            `Placeholder platelet count: 245 x10^9/L (not a measured result)`,
            `No clinical reference range or interpretation is provided.`,
            `Fictional laboratory: Sample Results Studio (not a real lab)`
        ]
    },
    {
        id: "organ-investigation",
        label: "Organ-specific investigation report",
        title: "Synthetic Organ Investigation Demonstration",
        lines: profile => [
            `Demo profile: ${profile.name} | ${profile.reference}`,
            `Investigation label: fictional ${["kidney","liver","heart","lung","pancreas","intestine"][(Number(profile.id.slice(-2)) - 1) % 6]} imaging placeholder`,
            `Result: no real scan, specimen, or diagnostic analysis exists.`,
            `Invented note: "Sample text for interface layout only."`,
            `This placeholder is not an investigation report or medical opinion.`,
            `Do not use it to assess eligibility, urgency, or organ allocation.`,
            `Fictional imaging centre: Example View (not a real facility)`
        ]
    },
    {
        id: "patient-consent",
        label: "Patient consent form",
        title: "Demonstration Consent Form",
        lines: profile => [
            `Named demo profile: ${profile.name} | ${profile.reference}`,
            `This page demonstrates the appearance of a consent upload only.`,
            `It is not a legally valid consent, authorization, or release.`,
            `No signature has been collected. No real person has consented.`,
            `Demonstration checkbox: [ X ] Sample form preview`,
            `Do not use this document for treatment, donation, or transport.`,
            `Fictional form revision: DEMO-1`
        ]
    },
    {
        id: "fictional-identity",
        label: "Fictional identity document",
        title: "Fictional Demo Identity Card",
        lines: profile => [
            `Name: ${profile.name}`,
            `Reference: ${profile.reference}`,
            `Date of birth: FICTIONAL - NOT RECORDED`,
            `Address: ${profile.city} Demonstration District (invented)`,
            `Identity number: DEMO-ONLY-${profile.reference}`,
            `This is a fictional prop page, not an identity document.`,
            `It has no government issuer, security features, or legal validity.`,
            `Never use this sample to identify or verify a real person.`
        ]
    }
];

function escapePdfText(value) {
    return String(value)
        .replace(/\u2013/g, "\x96")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");
}

function makePdf(profile, documentType) {
    const commands = [
        "0.035 0.32 0.25 rg",
        "40 745 515 42 re f",
        "1 1 1 rg",
        "BT /F1 14 Tf 54 766 Td (" + escapePdfText(disclaimer) + ") Tj ET",
        "0.08 0.13 0.22 rg",
        "BT /F2 20 Tf 54 700 Td (" + escapePdfText(documentType.title) + ") Tj ET",
        "0.28 0.34 0.38 rg",
        "BT /F1 11 Tf 54 674 Td (OrganRoute synthetic demonstration - profile " +
            escapePdfText(profile.reference) + ") Tj ET"
    ];

    let y = 635;
    for (const line of documentType.lines(profile)) {
        commands.push(
            `BT /F1 11 Tf 54 ${y} Td (${escapePdfText(line)}) Tj ET`
        );
        y -= 25;
    }
    commands.push(
        "0.65 0.1 0.1 rg",
        "BT /F2 15 Tf 54 112 Td (" + escapePdfText(disclaimer) + ") Tj ET",
        "0.3 0.34 0.38 rg",
        "BT /F1 9 Tf 54 82 Td (Synthetic sample for software testing only. No clinical or identity use.) Tj ET"
    );

    const stream = Buffer.from(commands.join("\n"), "latin1");
    const objects = [
        Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"),
        Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "ascii"),
        Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>", "ascii"),
        Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "ascii"),
        Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "ascii"),
        Buffer.concat([
            Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "ascii"),
            stream,
            Buffer.from("\nendstream", "ascii")
        ])
    ];

    const parts = [Buffer.from("%PDF-1.4\n%OrganRoute synthetic samples\n", "ascii")];
    const offsets = [0];
    let position = parts[0].length;
    objects.forEach((object, index) => {
        offsets.push(position);
        const wrapped = Buffer.concat([
            Buffer.from(`${index + 1} 0 obj\n`, "ascii"),
            object,
            Buffer.from("\nendobj\n", "ascii")
        ]);
        parts.push(wrapped);
        position += wrapped.length;
    });

    const xrefOffset = position;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
        xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    parts.push(Buffer.from(
        `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
        "ascii"
    ));
    return Buffer.concat(parts);
}

function getDemoDocumentCatalog() {
    return profiles.map(profile => ({
        ...profile,
        documents: documentTypes.map(documentType => ({
            id: `${profile.id}:${documentType.id}`,
            type: documentType.id,
            label: documentType.label,
            fileName: `${profile.id}-${documentType.id}.pdf`,
            mimeType: "application/pdf",
            fictional: true,
            disclaimer
        }))
    }));
}

async function ensureDemoDocuments() {
    await fs.mkdir(privateUploadDirectory, { recursive: true, mode: 0o700 });
    await fs.chmod(privateUploadDirectory, 0o700);
    for (const profile of profiles) {
        for (const documentType of documentTypes) {
            const fileName = `${profile.id}-${documentType.id}.pdf`;
            const filePath = path.join(privateUploadDirectory, fileName);
            try {
                await fs.access(filePath);
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
                await fs.writeFile(filePath, makePdf(profile, documentType), {
                    flag: "wx",
                    mode: 0o600
                });
            }
        }
    }
    return getDemoDocumentCatalog();
}

async function getDemoDocument(sampleId) {
    const catalog = getDemoDocumentCatalog();
    for (const profile of catalog) {
        const document = profile.documents.find(item => item.id === sampleId);
        if (document) {
            return {
                ...document,
                profileName: profile.name,
                profileReference: profile.reference,
                path: path.join(privateUploadDirectory, document.fileName)
            };
        }
    }
    return null;
}

module.exports = {
    disclaimer,
    ensureDemoDocuments,
    getDemoDocument,
    getDemoDocumentCatalog,
    privateUploadDirectory
};
