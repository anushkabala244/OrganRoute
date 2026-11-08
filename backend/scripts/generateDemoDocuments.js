require("dotenv").config();

const { ensureDemoDocuments } = require("../services/demoDocuments");

ensureDemoDocuments()
    .then(profiles => {
        const total = profiles.reduce(
            (count, profile) => count + profile.documents.length,
            0
        );
        console.log(`Generated or verified ${total} fictional demo PDFs for ${profiles.length} profiles.`);
    })
    .catch(error => {
        console.error("Unable to generate fictional demo PDFs:", error);
        process.exitCode = 1;
    });
