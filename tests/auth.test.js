const assert = require("node:assert/strict");
const { test } = require("node:test");
const bcrypt = require("bcrypt");
const { ROLES } = require("../src/auth");
const password = "test-only-password";
const users = Object.values(ROLES).map((roleName, index) => ({
    userId: index + 1,
    email: "user" + index + "@example.test",
    fname: "Test",
    lname: "User",
    isActive: true,
    role: { roleName },
    passwordHash: bcrypt.hashSync(password, 4),
}));
let lastQuery, created;
const database = {
    user: {
        findUnique: async ({ where, select }) => {
            const user = users.find((user) =>
                where.email
                    ? user.email === where.email
                    : user.userId === where.userId,
            );
            return user
                ? Object.fromEntries(
                      Object.keys(select).map((key) => [key, user[key]]),
                  )
                : null;
        },
    },
    equipment: { findMany: async () => [] },
    facility: {
        findMany: async () => [],
        findUnique: async () => ({ facilityId: 1 }),
    },
    reservationStatus: { findUnique: async () => ({ statusId: 1 }) },
    reservation: {
        findMany: async (query) => {
            lastQuery = query;
            return [];
        },
        findUnique: async () => ({ reservationId: 1, requestedBy: 3 }),
        create: async ({ data }) => {
            created = data;
            return data;
        },
        update: async ({ data }) => data,
    },
};
// Replace only the database boundary; exercise real Express routes and controllers.
require.cache[require.resolve("../src/prisma")] = { exports: database };
const { createApp } = require("../src/app");

test("authentication and authorization through HTTP", async (t) => {
    let now = 0;
    const server = createApp({
        database,
        authOptions: { now: () => now },
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = "http://127.0.0.1:" + server.address().port;
    async function request(path, { token, body, method = "GET" } = {}) {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...(token ? { Authorization: "Bearer " + token } : {}),
                ...(body ? { "Content-Type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json() };
    }
    const login = (index, overrides = {}) =>
        request("/api/auth/login", {
            method: "POST",
            body: { email: users[index].email, password, ...overrides },
        });
    for (const path of [
        "/api/facilities",
        "/api/equipment",
        "/api/reservations",
        "/api/test/database",
    ]) {
        assert.equal((await request(path)).status, 401);
    }
    assert.equal((await login(0, { password: "wrong" })).status, 401);
    assert.equal(
        (await login(0, { email: "missing@example.test" })).status,
        401,
    );
    users[0].isActive = false;
    assert.equal((await login(0)).status, 401);
    users[0].isActive = true;
    assert.equal((await login(0, { roleId: 1 })).status, 400);
    assert.equal((await login(0, { password: "a".repeat(73) })).status, 400);
    const tokens = [];
    for (let i = 0; i < 3; i++) {
        const result = await login(i);
        assert.equal(result.status, 200);
        assert.equal(
            JSON.stringify(result.body).includes("passwordHash"),
            false,
        );
        tokens.push(result.body.token);
    }
    const [admin, staff, member] = tokens;
    assert.equal(
        (await request("/api/equipment", { token: member })).status,
        200,
    );
    for (const path of ["/api/equipment", "/api/facilities"]) {
        for (const method of ["POST", "PUT", "DELETE"]) {
            assert.equal(
                (
                    await request(path + (method === "POST" ? "" : "/1"), {
                        token: member,
                        method,
                        body: { userId: 1, roleId: 1 },
                    })
                ).status,
                403,
            );
        }
    }
    // Staff/admin reach real controller validation rather than the role guard.
    for (const token of [admin, staff])
        assert.equal(
            (
                await request("/api/equipment", {
                    token,
                    method: "POST",
                    body: {},
                })
            ).status,
            400,
        );
    assert.equal(
        (await request("/api/test/database", { token: member })).status,
        403,
    );
    assert.equal(
        (await request("/api/reservations", { token: member })).status,
        200,
    );
    assert.deepEqual(lastQuery.where, { requestedBy: 3 });
    assert.equal(
        (await request("/api/reservations", { token: staff })).status,
        200,
    );
    assert.deepEqual(lastQuery.where, {});
    assert.equal(
        (await request("/api/reservations/1", { token: member })).status,
        200,
    );
    assert.equal(
        (
            await request("/api/reservations", {
                token: member,
                method: "POST",
                body: {
                    facilityId: 1,
                    requestedBy: 1,
                    userId: 1,
                    roleId: 1,
                    purpose: "Meeting",
                    startDatetime: "2027-01-01T10:00:00Z",
                    endDatetime: "2027-01-01T11:00:00Z",
                },
            })
        ).status,
        201,
    );
    assert.equal(created.requestedBy, 3);
    users[2].userId = 4;
    assert.equal(
        (await request("/api/auth/me", { token: member })).status,
        401,
    );
    users[2].userId = 3;
    // Re-login as another member to test object ownership.
    users[2].userId = 4;
    now += 900001;
    const other = (await login(2)).body.token;
    assert.equal(
        (await request("/api/reservations/1", { token: other })).status,
        403,
    );
    assert.equal(
        (
            await request("/api/reservations/1", {
                token: other,
                method: "PUT",
                body: { purpose: "Changed", userId: 3, roleId: 1 },
            })
        ).status,
        403,
    );
    users[2].userId = 3;
    users[0].role.roleName = ROLES.MEMBER;
    assert.equal(
        (await request("/api/equipment/1", { token: admin, method: "DELETE" }))
            .status,
        403,
    );
    users[0].role.roleName = ROLES.ADMIN;
    users[1].isActive = false;
    assert.equal((await request("/api/auth/me", { token: staff })).status, 401);
    users[1].isActive = true;
    assert.equal((await request("/api/auth/me", { token: staff })).status, 401);
    assert.equal(
        (await request("/api/auth/logout", { token: admin, method: "POST" }))
            .status,
        200,
    );
    assert.equal((await request("/api/auth/me", { token: admin })).status, 401);
    const fresh = (await login(0)).body.token;
    const tampered = (fresh[0] === "a" ? "b" : "a") + fresh.slice(1);
    assert.equal(
        (await request("/api/auth/me", { token: tampered })).status,
        401,
    );
    now += 3600000;
    assert.equal((await request("/api/auth/me", { token: fresh })).status, 401);
    for (let i = 0; i < 10; i++) await login(0, { password: "wrong" });
    assert.equal((await login(0)).status, 429);
});

test("authentication fails closed on database errors and unknown roles", async () => {
    const { createAuth } = require("../src/auth");
    let unavailable = false;
    const user = { ...users[0], role: { roleName: "Unrecognized role" } };
    const auth = createAuth({
        user: {
            findUnique: async () => {
                if (unavailable)
                    throw new Error("private database connection string");
                return user;
            },
        },
    });
    const response = {
        set() {},
        status(code) {
            this.code = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    const req = { ip: "test", body: { email: user.email, password } };
    await auth.login(req, response);
    assert.equal(response.code, 403);
    unavailable = true;
    await auth.login(req, response);
    assert.equal(response.code, 503);
    assert.equal(JSON.stringify(response.body).includes("private"), false);
    let called = false;
    auth.allowRoles(ROLES.ADMIN)({}, response, () => {
        called = true;
    });
    assert.equal(response.code, 401);
    assert.equal(called, false);
});
