const assert = require("node:assert/strict");
const { test, mock } = require("node:test");
const { invoke } = require("./helpers");
const db = {
    equipment: {
        create: mock.fn(async ({ data }) => data),
        update: mock.fn(async ({ data }) => data),
        findUnique: mock.fn(async () => null),
    },
};
db.$transaction = async (work) => work(db);
db.$queryRaw = async () => [];
require.cache[require.resolve("../src/prisma")] = { exports: db };
const controller = require("../src/controllers/equipment.controller");
const valid = { categoryId: 1, equipmentName: "Projector", totalQuantity: 5 };
for (const [name, change] of Object.entries({
    "missing category": { categoryId: undefined },
    "missing name": { equipmentName: undefined },
    "empty name": { equipmentName: "  " },
    "non-string name": { equipmentName: 5 },
    "zero total": { totalQuantity: 0 },
    "negative total": { totalQuantity: -1 },
    "fractional total": { totalQuantity: 2.5 },
    "partial number": { categoryId: "1oops" },
    "null total": { totalQuantity: null },
    "false category": { categoryId: false },
    "unsafe stock": { totalQuantity: 2147483648 },
    "manual availability": { availableQuantity: 4 },
    "invalid condition": { conditionStatus: "anything" },
})) {
    test("creation rejects " + name + " before writing", async () => {
        const before = db.equipment.create.mock.callCount();
        const res = await invoke(controller.createEquipment, {
            ...valid,
            ...change,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(db.equipment.create.mock.callCount(), before);
    });
}
test("valid creation trims name and ignores identity fields", async () => {
    const res = await invoke(controller.createEquipment, {
        ...valid,
        equipmentName: " Projector ",
        equipmentId: 999,
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.availableQuantity, 5);
    assert.equal(res.body.data.equipmentName, "Projector");
    assert.equal(res.body.data.equipmentId, undefined);
});
test("invalid identifiers are rejected and missing equipment returns 404", async () => {
    for (const id of ["1x", "-1", "0", "2.5"])
        assert.equal(
            (await invoke(controller.getEquipmentById, {}, id)).statusCode,
            400,
        );
    assert.equal((await invoke(controller.getEquipmentById)).statusCode, 404);
});
test("availability cannot be manually changed", async () => {
    assert.equal(
        (await invoke(controller.updateEquipment, { availableQuantity: 3 }))
            .statusCode,
        400,
    );
});
test("database details stay private", async () => {
    db.equipment.create.mock.mockImplementationOnce(async () => {
        throw new Error("secret database URL");
    });
    const res = await invoke(controller.createEquipment, valid);
    assert.equal(res.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(res.body), /secret/);
});

test("equipment deactivation uses lifecycle without overwriting physical condition", async () => {
    const result = await invoke(controller.deleteEquipment);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(db.equipment.update.mock.calls.at(-1).arguments[0].data, {
        isActive: false,
    });
    for (const conditionStatus of ["Inactive", null])
        assert.equal(
            (await invoke(controller.updateEquipment, { conditionStatus }))
                .statusCode,
            400,
        );
    for (const isActive of ["false", 0, null])
        assert.equal(
            (await invoke(controller.updateEquipment, { isActive })).statusCode,
            400,
        );
    assert.equal(
        (
            await invoke(controller.createEquipment, {
                ...valid,
                isActive: false,
            })
        ).statusCode,
        400,
    );
    assert.equal(
        (
            await invoke(controller.updateEquipment, {
                isActive: true,
                conditionStatus: "Fair",
            })
        ).statusCode,
        200,
    );
});
