const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test, mock } = require("node:test");
const vm = require("node:vm");

// Load the real controller with only its Prisma import replaced. The real
// client and dotenv are never loaded, so these tests cannot contact Supabase.
function controllerWithDatabaseStub(existingEquipment = null) {
    const prisma = {
        equipment: {
            findUnique: mock.fn(async () => existingEquipment),
            create: mock.fn(async ({ data }) => ({ equipmentId: 1, ...data })),
            update: mock.fn(async ({ data }) => data),
        },
    };
    const context = {
        module: { exports: {} },
        require(id) {
            assert.equal(id, "../prisma", "Unexpected controller dependency");
            return prisma;
        },
        console: { error: mock.fn() },
    };
    const filename = path.join(
        __dirname,
        "../src/controllers/equipment.controller.js",
    );
    vm.runInNewContext(readFileSync(filename, "utf8"), context, { filename });
    return { controller: context.module.exports, prisma };
}

async function invoke(handler, body = {}, id = "1") {
    const response = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    await handler({ body, params: { id } }, response);
    return response;
}

const validEquipment = {
    categoryId: 1,
    equipmentName: "Projector",
    totalQuantity: 5,
};

for (const field of ["categoryId", "equipmentName", "totalQuantity"]) {
    test(`creation rejects missing ${field} without writing`, async () => {
        const { controller, prisma } = controllerWithDatabaseStub();
        const body = { ...validEquipment };
        delete body[field];
        const response = await invoke(controller.createEquipment, body);
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
        assert.match(response.body.message, /required/);
        assert.equal(prisma.equipment.create.mock.callCount(), 0);
    });
}

for (const [name, changes] of [
    ["zero total", { totalQuantity: 0 }],
    ["negative total", { totalQuantity: -1 }],
    ["negative availability", { availableQuantity: -1 }],
    ["availability above total", { availableQuantity: 6 }],
    ["nonnumeric category", { categoryId: "invalid" }],
]) {
    test(`creation rejects ${name} without writing`, async () => {
        const { controller, prisma } = controllerWithDatabaseStub();
        const response = await invoke(controller.createEquipment, {
            ...validEquipment,
            ...changes,
        });
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
        assert.equal(prisma.equipment.create.mock.callCount(), 0);
    });
}

test("valid creation defaults availability and ignores unexpected fields", async () => {
    const { controller, prisma } = controllerWithDatabaseStub();
    const response = await invoke(controller.createEquipment, {
        ...validEquipment,
        equipmentId: 999,
        equipmentName: "  Projector  ",
        unexpected: true,
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.success, true);
    const data = prisma.equipment.create.mock.calls[0].arguments[0].data;
    assert.equal(data.availableQuantity, 5);
    assert.equal(data.equipmentName, "Projector");
    assert.equal(data.conditionStatus, "Good");
    assert.equal(Object.hasOwn(data, "equipmentId"), false);
    assert.equal(Object.hasOwn(data, "unexpected"), false);
});

test("invalid equipment ID is rejected before any database lookup", async () => {
    const { controller, prisma } = controllerWithDatabaseStub();
    const response = await invoke(controller.getEquipmentById, {}, "invalid");
    assert.equal(response.statusCode, 400);
    assert.equal(prisma.equipment.findUnique.mock.callCount(), 0);
});

test("missing equipment returns 404", async () => {
    const { controller } = controllerWithDatabaseStub();
    const response = await invoke(controller.getEquipmentById);
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.success, false);
});

test("partial stock update cannot lower total below stored availability", async () => {
    const { controller, prisma } = controllerWithDatabaseStub({
        equipmentId: 1,
        totalQuantity: 5,
        availableQuantity: 4,
    });
    const response = await invoke(controller.updateEquipment, {
        totalQuantity: 3,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(prisma.equipment.update.mock.callCount(), 0);
});

test("database failure returns a generic error without leaking details", async () => {
    const { controller, prisma } = controllerWithDatabaseStub();
    prisma.equipment.create.mock.mockImplementation(async () => {
        throw new Error("private database details");
    });
    const response = await invoke(controller.createEquipment, validEquipment);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, "Failed to create equipment.");
    assert.doesNotMatch(
        JSON.stringify(response.body),
        /private database details/,
    );
});
