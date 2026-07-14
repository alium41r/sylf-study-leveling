import { describe, it, expect } from "vitest";

const BASE_URL = "http://localhost:3000/api";

describe("Notes API Integration Tests", () => {

    // We will store the VIP pass here so our robot can use it in later tests!
    let token = "";

    it("should register and log in a test user", async () => {
        // 1. Create a fake user
        const randomNum = Math.floor(Math.random() * 100000);
        const fakeEmail = `robot${randomNum}@test.com`;
        const password = "password123";

        await fetch(`${BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Robot", email: fakeEmail, password }),
        });

        // 2. Log in with that fake user
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: fakeEmail, password }),
        });

        // 3. Verify it worked and grab the token!
        expect(loginRes.status).toBe(200);
        const data = await loginRes.json();
        expect(data.token).toBeDefined();

        // Save the token to our global variable for the next tests
        token = data.token;
    });

    it("should create a note when logged in (Happy Path)", async () => {
        const res = await fetch(`${BASE_URL}/notes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // We are using the token from the first test!
            },
            body: JSON.stringify({ title: "Test Note", content: "This is a test note!" }),
        });

        expect(res.status).toBe(201);
    });

    it("should fail to create a note when NOT logged in (Error Path)", async () => {
        const res = await fetch(`${BASE_URL}/notes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Notice we are NOT sending the Authorization header here!
            },
            body: JSON.stringify({ title: "Sneaky Note", content: "Trying to hack the mainframe!" }),
        });

        // The bouncer should kick us out with a 401 Unauthorized status!
        expect(res.status).toBe(401);
    });

    it("should fetch all notes (Read)", async () => {
        const res = await fetch(`${BASE_URL}/notes`);
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it("should block a normal user from deleting a note (Admin Rule)", async () => {
        const res = await fetch(`${BASE_URL}/notes/1`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}` // The robot is a normal user!
            }
        });

        // The bouncer should reject it with 403 Forbidden!
        expect(res.status).toBe(403);
    });

    it("should run the entire Happy Path End-to-End", async () => {
        const randomNum = Math.floor(Math.random() * 100000);
        const email = `e2e${randomNum}@test.com`;
        const password = "password123";

        // 1. Register
        await fetch(`${BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "E2E User", email, password }),
        });

        // 2. Login
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const loginData = await loginRes.json();
        const e2eToken = loginData.token;
        expect(e2eToken).toBeDefined();

        // 3. Create Note
        const createRes = await fetch(`${BASE_URL}/notes`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${e2eToken}`
            },
            body: JSON.stringify({ title: "E2E Note", content: "Testing the whole flow!" }),
        });
        expect(createRes.status).toBe(201);
        const createdNote = await createRes.json();

        // 4. Update Note (PUT)
        const updateRes = await fetch(`${BASE_URL}/notes/${createdNote.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${e2eToken}`
            },
            body: JSON.stringify({ title: "Updated E2E Note", content: "It works!" }),
        });
        expect(updateRes.status).toBe(200);
        const updatedNote = await updateRes.json();
        expect(updatedNote.title).toBe("Updated E2E Note");
    });

});
