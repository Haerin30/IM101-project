const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const { invoke } = require("./helpers");
const db = {
    $transaction: mock.fn(async () => {
        throw new Error("must not write");
    }),
};
require.cache[require.resolve("../src/prisma")] = { exports: db };
const controller = require("../src/controllers/reservation.controller");
const start = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 90000000).toISOString();
const valid = {
    facilityId: 1,
    purpose: "Meeting",
    startDatetime: start,
    endDatetime: end,
};
for (const [name, change] of Object.entries({
    "blank purpose": { purpose: " " },
    "null purpose": { purpose: null },
    "invalid id": { facilityId: "1x" },
    "reversed dates": { startDatetime: end, endDatetime: start },
    "equal dates": { endDatetime: start },
    "invalid date": { startDatetime: "bad" },
    "no timezone": { startDatetime: "2030-01-01T10:00:00" },
    "invalid calendar": { startDatetime: "2030-02-30T10:00:00Z" },
    "past date": { startDatetime: "2000-01-01T10:00:00Z" },
    "duplicate equipment": {
        equipmentItems: [
            { equipmentId: 1, quantity: 1 },
            { equipmentId: 1, quantity: 1 },
        ],
    },
    "negative equipment": {
        equipmentItems: [{ equipmentId: 1, quantity: -1 }],
    },
}))
    test("reservation rejects " + name + " before writing", async () => {
        const res = await invoke(controller.createReservation, {
            ...valid,
            ...change,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(db.$transaction.mock.callCount(), 0);
    });
test("non-object bodies return 400", async () => {
    for (const b of [null, [], 5])
        assert.equal(
            (await invoke(controller.createReservation, b)).statusCode,
            400,
        );
});
