const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ROLES } = require("../src/auth");
let row,
    assigned,
    query,
    homeFacilityId = null;
const db = {
    $queryRaw: async () => [],
    $transaction: async (work) => work(db),
    facility: {
        findUnique: async ({ where }) =>
            where.facilityId === 1 ? { facilityId: 1 } : null,
    },
    equipment: {
        findUnique: async ({ where }) =>
            where.equipmentId === 1 ? { equipmentId: 1, homeFacilityId } : null,
    },
    user: { findUnique: async () => assigned },
    maintenanceRequest: {
        create: async ({ data }) => {
            row = { requestId: 1, ...data };
            return row;
        },
        findUnique: async () => row,
        findMany: async (value) => {
            query = value;
            return [row];
        },
        update: async ({ data }) => {
            row = { ...row, ...data };
            return row;
        },
    },
    auditLog: {
        findMany: async (value) => {
            query = value;
            return [
                { logId: 1n, tableName: "MaintenanceRequest", changedBy: 2 },
            ];
        },
    },
};
require.cache[require.resolve("../src/prisma")] = { exports: db };
const c = require("../src/controllers/maintenance.controller");
async function call(name, body, role = ROLES.MEMBER, userId = 1, id = "1") {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
    };
    await c[name](
        { body, params: { id }, user: { userId, role: { roleName: role } } },
        res,
    );
    return res;
}
test("maintenance validation rejects malformed and forbidden input", async () => {
    for (const body of [
        null,
        [],
        {},
        { description: " ", facilityId: 1 },
        { description: "Issue" },
        { description: "Issue", facilityId: "1x" },
        { description: "Issue", equipmentId: 0 },
        { description: "Issue", facilityId: null },
        { description: "Issue", facilityId: 1, reportedBy: 2 },
        { description: "Issue", facilityId: 1, priority: "High" },
    ])
        assert.equal((await call("createRequest", body)).statusCode, 400);
    for (const key of ["facilityId", "equipmentId"])
        assert.equal(
            (await call("createRequest", { description: "Issue", [key]: 999 }))
                .statusCode,
            404,
        );
    assert.equal(
        (
            await call(
                "createRequest",
                { description: "Issue", facilityId: 1, priority: "Critical" },
                ROLES.STAFF,
            )
        ).statusCode,
        400,
    );
    assert.equal(
        (await call("getRequest", {}, ROLES.ADMIN, 1, "-1")).statusCode,
        400,
    );
});
test("maintenance ownership, assignment, workflow, resolution and history", async () => {
    let result = await call("createRequest", {
        description: "  Leak  ",
        facilityId: 1,
        equipmentId: 1,
    });
    assert.equal(result.statusCode, 201);
    assert.equal(row.description, "Leak");
    assert.equal(row.reportedBy, 1);
    assert.equal(row.priority, "Normal");
    await call("listRequests");
    assert.deepEqual(query.where, { reportedBy: 1 });
    await call("listRequests", {}, ROLES.STAFF);
    assert.deepEqual(query.where, {});
    for (const name of ["getRequest", "editRequest", "getHistory"])
        assert.equal(
            (await call(name, { description: "Changed" }, ROLES.MEMBER, 2))
                .statusCode,
            403,
        );
    assert.equal(
        (await call("editRequest", { description: "Revised" })).statusCode,
        200,
    );
    assert.equal(
        (await call("editRequest", { priority: "High" })).statusCode,
        400,
    );
    for (const name of ["assignRequest", "updateStatus"])
        assert.equal((await call(name, {})).statusCode, 403);
    for (const user of [
        null,
        { isActive: false, role: { roleName: ROLES.STAFF } },
        { isActive: true, role: { roleName: ROLES.MEMBER } },
        { isActive: true, role: { roleName: ROLES.ADMIN } },
    ]) {
        assigned = user;
        assert.equal(
            (await call("assignRequest", { assignedStaffId: 2 }, ROLES.STAFF))
                .statusCode,
            400,
        );
    }
    assigned = { isActive: true, role: { roleName: ROLES.STAFF } };
    assert.equal(
        (await call("assignRequest", { assignedStaffId: 2 }, ROLES.STAFF))
            .statusCode,
        200,
    );
    assert.equal(row.assignedStaffId, 2);
    assert.equal(
        (await call("editRequest", { priority: "Urgent" }, ROLES.STAFF))
            .statusCode,
        200,
    );
    assert.equal(
        (
            await call(
                "updateStatus",
                { status: "Resolved", resolutionNotes: "Fixed" },
                ROLES.ADMIN,
            )
        ).statusCode,
        409,
    );
    assert.equal(
        (await call("updateStatus", { status: "Invalid" }, ROLES.STAFF))
            .statusCode,
        400,
    );
    assert.equal(
        (
            await call(
                "updateStatus",
                { status: "In Progress", resolutionNotes: "Early" },
                ROLES.STAFF,
            )
        ).statusCode,
        400,
    );
    assert.equal(
        (await call("updateStatus", { status: "In Progress" }, ROLES.STAFF))
            .statusCode,
        200,
    );
    assert.equal(
        (await call("editRequest", { description: "Changed" })).statusCode,
        409,
    );
    assert.equal(
        (await call("updateStatus", { status: "Open" }, ROLES.STAFF))
            .statusCode,
        409,
    );
    for (const resolutionNotes of [undefined, null, " "])
        assert.equal(
            (
                await call(
                    "updateStatus",
                    { status: "Resolved", resolutionNotes },
                    ROLES.STAFF,
                )
            ).statusCode,
            400,
        );
    assert.equal(
        (
            await call(
                "updateStatus",
                { status: "Resolved", resolutionNotes: " Fixed leak " },
                ROLES.STAFF,
            )
        ).statusCode,
        200,
    );
    assert.equal(row.resolutionNotes, "Fixed leak");
    assert.ok(row.resolvedAt instanceof Date);
    for (const role of [ROLES.MEMBER, ROLES.STAFF, ROLES.ADMIN]) {
        assert.equal(
            (await call("editRequest", { description: "Changed" }, role))
                .statusCode,
            409,
        );
        if (role !== ROLES.MEMBER) {
            assert.equal(
                (await call("assignRequest", { assignedStaffId: 2 }, role))
                    .statusCode,
                409,
            );
            assert.equal(
                (await call("updateStatus", { status: "Open" }, role))
                    .statusCode,
                409,
            );
        }
    }
    result = await call("getHistory");
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data[0].logId, "1");
    assert.deepEqual(query.where, {
        tableName: "MaintenanceRequest",
        recordId: 1,
    });
    row = null;
    assert.equal((await call("getRequest")).statusCode, 404);
});

test("maintenance endpoints reject forbidden fields and empty patches", async () => {
    row = { requestId: 1, reportedBy: 1, status: "Open" };
    for (const [name, body] of [
        ["editRequest", {}],
        ["editRequest", { description: "x", facilityId: 2 }],
        ["editRequest", { status: "Resolved" }],
        ["assignRequest", { assignedStaffId: 2, roleId: 1 }],
        ["assignRequest", { assignedStaffId: null }],
        ["updateStatus", { status: "In Progress", reportedBy: 2 }],
        [
            "updateStatus",
            {
                status: "Resolved",
                resolutionNotes: "Fixed",
                resolvedAt: "2030-01-01",
            },
        ],
    ])
        assert.equal((await call(name, body, ROLES.ADMIN)).statusCode, 400);
    const created = await call(
        "createRequest",
        { description: "Equipment fault", equipmentId: 1, priority: "High" },
        ROLES.STAFF,
    );
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.data.equipmentId, 1);
    assert.equal(created.body.data.priority, "High");
});

test("maintenance progression requires an eligible current assignee and supports reassignment", async () => {
    for (const status of ["Open", "In Progress"]) {
        row = { requestId: 1, reportedBy: 1, status, assignedStaffId: null };
        const body =
            status === "Open"
                ? { status: "In Progress" }
                : { status: "Resolved", resolutionNotes: "Fixed" };
        assert.equal(
            (await call("updateStatus", body, ROLES.ADMIN)).statusCode,
            409,
        );
        row.assignedStaffId = 2;
        for (const user of [
            null,
            { isActive: false, role: { roleName: ROLES.STAFF } },
            { isActive: true, role: { roleName: ROLES.MEMBER } },
        ]) {
            assigned = user;
            assert.equal(
                (await call("updateStatus", body, ROLES.STAFF)).statusCode,
                409,
            );
        }
        assigned = { isActive: true, role: { roleName: ROLES.STAFF } };
        assert.equal(
            (await call("assignRequest", { assignedStaffId: 3 }, ROLES.ADMIN))
                .statusCode,
            200,
        );
        assert.equal(
            (await call("updateStatus", body, ROLES.STAFF)).statusCode,
            200,
        );
    }
});
test("maintenance facility and equipment must match unless equipment is portable", async () => {
    for (const home of [null, 1, 2]) {
        homeFacilityId = home;
        assert.equal(
            (
                await call("createRequest", {
                    facilityId: 1,
                    equipmentId: 1,
                    description: "Fault",
                })
            ).statusCode,
            home === 2 ? 400 : 201,
        );
        assert.equal(
            (
                await call("createRequest", {
                    equipmentId: 1,
                    description: "Fault",
                })
            ).statusCode,
            201,
        );
        assert.equal(
            (
                await call("createRequest", {
                    facilityId: 1,
                    description: "Fault",
                })
            ).statusCode,
            201,
        );
    }
    homeFacilityId = null;
});
