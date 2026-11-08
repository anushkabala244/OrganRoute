const assert = require("node:assert/strict");
const express = require("express");
const { after, before, test } = require("node:test");
const authRoutes = require("../routes/auth");

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
    await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
    );
});

test("public registration rejects driver accounts before creating a user", async () => {
    const response = await fetch(`${baseUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "driver" })
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.match(result.message, /patient and hospital accounts only/i);
});

test("public login rejects driver and platform administrator roles", async () => {
    for (const role of ["driver", "admin"]) {
        const response = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "person@example.test", password: "example-password", role })
        });
        const result = await response.json();

        assert.equal(response.status, 400);
        assert.match(result.message, /designated sign-in route/i);
    }
});
