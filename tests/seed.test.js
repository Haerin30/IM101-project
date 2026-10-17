const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const { seed } = require("../prisma/seed");
function database() {
    const calls = [];
    const table = {
        upsert: mock.fn(async (q) => {
            calls.push(q);
            return q.create;
        }),
        findUnique: async () => ({ roleId: 1 }),
    };
    return {
        calls,
        user: table,
        facilityType: table,
        equipmentCategory: table,
        building: table,
        role: table,
        reservationStatus: table,
    };
}
test("default seed creates lookup data without accounts", async () => {
    const db = database();
    await seed(db, {});
    assert.equal(
        db.calls.some((x) => x.create.passwordHash),
        false,
    );
});
test("weak or incomplete seed credentials fail before writes", async () => {
    for (const env of [
        { SEED_ADMIN_EMAIL: "a@example.test" },
        {
            SEED_ADMIN_EMAIL: "a@example.test",
            SEED_ADMIN_PASSWORD: "Admin123!",
        },
    ]) {
        const db = database();
        await assert.rejects(seed(db, env));
        assert.equal(db.calls.length, 0);
    }
});
test("reseed never updates credentials, roles, or active flag", async () => {
    const db = database();
    await seed(db, {
        SEED_ADMIN_EMAIL: "a@example.test",
        SEED_ADMIN_PASSWORD: "a-long-test-password-123!",
    });
    const account = db.calls.find((x) => x.create.passwordHash);
    assert.deepEqual(account.update, {});
    assert.notEqual(account.create.passwordHash, "a-long-test-password-123!");
});
