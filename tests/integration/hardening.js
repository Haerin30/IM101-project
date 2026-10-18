const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Pool } = require("pg");
module.exports = async function hardening(
    t,
    {
        db,
        request,
        adminToken,
        memberToken,
        adminUser,
        member,
        facility,
        inactive,
        equipment,
        roles,
        admin,
        url,
        schema,
    },
) {
    await require("./historical-maintenance")(t, { admin, url, schema });
    const root = "/api/maintenance-requests";
    const make = async (body) =>
        request(
            root,
            "POST",
            { description: "Hardening fault", ...body },
            memberToken,
        );
    await t.test(
        "maintenance asset matching and current assignee eligibility",
        async () => {
            await db.equipment.update({
                where: { equipmentId: equipment.equipmentId },
                data: { homeFacilityId: facility.facilityId },
            });
            assert.equal(
                (
                    await make({
                        facilityId: inactive.facilityId,
                        equipmentId: equipment.equipmentId,
                    })
                ).status,
                400,
            );
            assert.equal(
                (
                    await make({
                        facilityId: facility.facilityId,
                        equipmentId: equipment.equipmentId,
                    })
                ).status,
                201,
            );
            assert.equal(
                (await make({ equipmentId: equipment.equipmentId })).status,
                201,
            );
            assert.equal(
                (await make({ facilityId: inactive.facilityId })).status,
                201,
            );
            await assert.rejects(
                db.maintenanceRequest.create({
                    data: {
                        description: "Mismatch",
                        facilityId: inactive.facilityId,
                        equipmentId: equipment.equipmentId,
                    },
                }),
            );
            await db.equipment.update({
                where: { equipmentId: equipment.equipmentId },
                data: { homeFacilityId: null },
            });
            const result = await make({
                facilityId: inactive.facilityId,
                equipmentId: equipment.equipmentId,
            });
            assert.equal(result.status, 201);
            const id = result.body.data.requestId,
                path = root + "/" + id;
            const next = (status, resolutionNotes) =>
                request(
                    path + "/status",
                    "PATCH",
                    { status, resolutionNotes },
                    adminToken,
                );
            assert.equal((await next("In Progress")).status, 409);
            const staff = await db.user.create({
                data: {
                    roleId: roles.find(
                        (r) => r.roleName === "Facility/Maintenance Staff",
                    ).roleId,
                    fname: "Eligible",
                    lname: "Staff",
                    email: "hardening-staff@example.test",
                    passwordHash: "not-a-login-hash",
                },
            });
            const assign = () =>
                request(
                    path + "/assign",
                    "PATCH",
                    { assignedStaffId: staff.userId },
                    adminToken,
                );
            assert.equal((await assign()).status, 200);
            await db.user.update({
                where: { userId: staff.userId },
                data: { isActive: false },
            });
            assert.equal((await next("In Progress")).status, 409);
            await assert.rejects(
                db.maintenanceRequest.update({
                    where: { requestId: id },
                    data: { status: "In Progress" },
                }),
            );
            await db.user.update({
                where: { userId: staff.userId },
                data: { isActive: true },
            });
            assert.equal((await assign()).status, 200);
            assert.equal((await next("In Progress")).status, 200);
            await db.user.update({
                where: { userId: staff.userId },
                data: { roleId: member.roleId },
            });
            assert.equal((await next("Resolved", "Fixed")).status, 409);
            await assert.rejects(
                db.maintenanceRequest.update({
                    where: { requestId: id },
                    data: {
                        status: "Resolved",
                        resolutionNotes: "Fixed",
                        resolvedAt: new Date(),
                    },
                }),
            );
            await db.user.update({
                where: { userId: staff.userId },
                data: {
                    roleId: roles.find(
                        (r) => r.roleName === "Facility/Maintenance Staff",
                    ).roleId,
                    isActive: false,
                },
            });
            assert.equal((await next("Resolved", "Fixed")).status, 409);
            const replacement = await db.user.create({
                data: {
                    roleId: roles.find(
                        (r) => r.roleName === "Facility/Maintenance Staff",
                    ).roleId,
                    fname: "Replacement",
                    lname: "Staff",
                    email: "replacement@example.test",
                    passwordHash: "not-a-login-hash",
                },
            });
            assert.equal(
                (
                    await request(
                        path + "/assign",
                        "PATCH",
                        { assignedStaffId: replacement.userId },
                        adminToken,
                    )
                ).status,
                200,
            );
            assert.equal((await next("Resolved", "Fixed")).status, 200);
            await assert.rejects(
                db.maintenanceRequest.update({
                    where: { requestId: id },
                    data: { description: "Rewrite history" },
                }),
            );
            await assert.rejects(
                db.maintenanceRequest.update({
                    where: { requestId: id },
                    data: {
                        status: "Open",
                        resolvedAt: null,
                        resolutionNotes: null,
                    },
                }),
            );
            await assert.rejects(
                db.maintenanceRequest.delete({ where: { requestId: id } }),
            );
            assert.equal(
                (
                    await db.facility.findUnique({
                        where: { facilityId: inactive.facilityId },
                    })
                ).status,
                "Inactive",
            );
        },
    );
    await t.test(
        "database maintenance invariants reject invalid direct writes",
        async () => {
            const data = {
                facilityId: facility.facilityId,
                description: "Direct valid request",
            };
            for (const change of [
                { description: "\t\n " },
                { priority: "Critical" },
                { status: "Unknown" },
                { facilityId: null },
                { status: "In Progress" },
                {
                    status: "Resolved",
                    resolutionNotes: "Fixed",
                    resolvedAt: new Date(),
                },
                { resolvedAt: new Date() },
            ])
                await assert.rejects(
                    db.maintenanceRequest.create({
                        data: { ...data, ...change },
                    }),
                );
            const open = await db.maintenanceRequest.create({ data });
            for (const change of [
                { priority: "Unknown" },
                { description: " " },
                { reportedBy: adminUser.userId },
                {
                    status: "Resolved",
                    resolutionNotes: "Fixed",
                    resolvedAt: new Date(),
                },
                { status: "In Progress" },
            ])
                await assert.rejects(
                    db.maintenanceRequest.update({
                        where: { requestId: open.requestId },
                        data: change,
                    }),
                );
            await assert.rejects(
                db.maintenanceRequest.delete({
                    where: { requestId: open.requestId },
                }),
            );
        },
    );
    await t.test(
        "equipment lifecycle blocks loans and allocations while preserving condition and stock",
        async () => {
            const created = await request(
                "/api/equipment",
                "POST",
                {
                    categoryId: equipment.categoryId,
                    equipmentName: "Lifecycle test",
                    totalQuantity: 2,
                    conditionStatus: "Fair",
                },
                adminToken,
            );
            assert.equal(created.status, 201);
            assert.equal(created.body.data.isActive, true);
            const id = created.body.data.equipmentId;
            const deactivated = await request(
                "/api/equipment/" + id,
                "DELETE",
                undefined,
                adminToken,
            );
            assert.equal(deactivated.status, 200);
            assert.equal(deactivated.body.data.isActive, false);
            assert.equal(deactivated.body.data.conditionStatus, "Fair");
            const loan = {
                equipmentId: id,
                userId: member.userId,
                quantity: 1,
                dueDate: new Date(Date.now() + 86400000).toISOString(),
            };
            assert.equal(
                (await request("/api/loans", "POST", loan, adminToken)).status,
                409,
            );
            const booking = {
                facilityId: facility.facilityId,
                purpose: "Inactive allocation test",
                startDatetime: new Date(Date.now() + 864000000).toISOString(),
                endDatetime: new Date(Date.now() + 867600000).toISOString(),
                equipmentItems: [{ equipmentId: id, quantity: 1 }],
            };
            assert.equal(
                (
                    await request(
                        "/api/reservations",
                        "POST",
                        booking,
                        memberToken,
                    )
                ).status,
                409,
            );
            await assert.rejects(
                db.equipment.update({
                    where: { equipmentId: id },
                    data: { conditionStatus: "Inactive" },
                }),
            );
            await assert.rejects(
                db.equipmentLoan.create({
                    data: {
                        ...loan,
                        dueDate: new Date(loan.dueDate),
                        approvedBy: adminUser.userId,
                    },
                }),
            );
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + id,
                        "PUT",
                        { isActive: true },
                        adminToken,
                    )
                ).status,
                200,
            );
            const borrowed = await request(
                "/api/loans",
                "POST",
                loan,
                adminToken,
            );
            assert.equal(borrowed.status, 201);
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + id,
                        "DELETE",
                        undefined,
                        adminToken,
                    )
                ).status,
                409,
            );
            assert.equal(
                (
                    await request(
                        "/api/loans/" + borrowed.body.data.loanId + "/return",
                        "POST",
                        { conditionIn: "Damaged" },
                        adminToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + id,
                        "DELETE",
                        undefined,
                        adminToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + id + "/repair",
                        "POST",
                        { quantity: 1 },
                        adminToken,
                    )
                ).status,
                200,
            );
            const saved = await db.equipment.findUnique({
                where: { equipmentId: id },
            });
            assert.equal(saved.isActive, false);
            assert.equal(saved.availableQuantity, 2);
            assert.equal(saved.damagedQuantity, 0);
            const history = await db.auditLog.findMany({
                where: { tableName: "Equipment", recordId: id },
            });
            assert.ok(
                history.some(
                    (r) =>
                        r.oldValue?.isActive === true &&
                        r.newValue?.isActive === false,
                ),
            );
            assert.equal(
                await db.equipmentLoan.count({ where: { equipmentId: id } }),
                1,
            );
            assert.equal(
                await db.equipmentRepair.count({ where: { equipmentId: id } }),
                1,
            );
        },
    );
    await t.test(
        "read-only preflight reports a valid local schema",
        async () => {
            const { preflight } = require("../../scripts/preflight");
            const client = await admin.connect();
            try {
                await client.query(
                    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
                );
                await client.query(
                    'SET LOCAL search_path TO "' + schema + '",public',
                );
                const result = await preflight(client);
                assert.deepEqual(result.issues, [], JSON.stringify(result));
                assert.equal(
                    JSON.stringify(result).includes("passwordHash"),
                    false,
                );
            } finally {
                await client.query("ROLLBACK");
                client.release();
            }
        },
    );
    await t.test(
        "hardening migrations fail atomically on legacy data and retain unknown conditions",
        async () => {
            const legacySchema = schema + "_hardening";
            await admin.query('CREATE SCHEMA "' + legacySchema + '"');
            const pool = new Pool({
                connectionString: url.toString(),
                options:
                    "-c search_path=" +
                    legacySchema +
                    ",public -c timezone=UTC",
            });
            const root = join(__dirname, "../../prisma/migrations");
            const migration = (name) =>
                readFileSync(join(root, name, "migration.sql"), "utf8").replace(
                    /^\uFEFF/,
                    "",
                );
            try {
                for (const name of readdirSync(root).sort()) {
                    if (name.endsWith(".toml") || name >= "20261018030000")
                        continue;
                    await pool.query(migration(name));
                }
                await pool.query(`INSERT INTO "EquipmentCategory" ("categoryName") VALUES ('Legacy');
                INSERT INTO "Equipment" ("categoryId","equipmentName","totalQuantity","availableQuantity","conditionStatus") VALUES (1,'Legacy inactive',2,2,'Inactive');
                INSERT INTO "MaintenanceRequest" (description) VALUES (' ');`);
                const { preflight } = require("../../scripts/preflight");
                assert.ok(
                    (await preflight(pool)).issues.some(
                        (row) => row.check === "maintenance_fields",
                    ),
                );
                const invalidBefore = (
                    await pool.query('SELECT * FROM "MaintenanceRequest"')
                ).rows;
                const auditBefore = (
                    await pool.query(
                        'SELECT * FROM "AuditLog" ORDER BY "logId"',
                    )
                ).rows;
                await assert.rejects(
                    pool.query(
                        migration("20261018030000_maintenance_integrity"),
                    ),
                );
                await pool.query("ROLLBACK");
                assert.deepEqual(
                    (await pool.query('SELECT * FROM "MaintenanceRequest"'))
                        .rows,
                    invalidBefore,
                );
                assert.deepEqual(
                    (
                        await pool.query(
                            'SELECT * FROM "AuditLog" ORDER BY "logId"',
                        )
                    ).rows,
                    auditBefore,
                );
                assert.equal(
                    (
                        await pool.query(
                            "SELECT 1 FROM pg_constraint WHERE conrelid='\"MaintenanceRequest\"'::regclass AND conname='maintenance_description'",
                        )
                    ).rowCount,
                    0,
                );
                // Repair only this synthetic test fixture, never production history.
                await pool.query(
                    'UPDATE "MaintenanceRequest" SET description=$1,"equipmentId"=1',
                    ["Verified legacy issue"],
                );
                await pool.query(
                    migration("20261018030000_maintenance_integrity"),
                );
                // Deliberately corrupt only this synthetic fixture to test the preflight.
                await pool.query(
                    'ALTER TABLE "Equipment" DISABLE TRIGGER equipment_integrity',
                );
                await pool.query(
                    'UPDATE "Equipment" SET "conditionStatus"=$1 WHERE "equipmentId"=1',
                    ["Unverified"],
                );
                await pool.query(
                    'ALTER TABLE "Equipment" ENABLE TRIGGER equipment_integrity',
                );
                await assert.rejects(
                    pool.query(migration("20261018040000_equipment_lifecycle")),
                );
                await pool.query("ROLLBACK");
                assert.equal(
                    (
                        await pool.query(
                            "SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='Equipment' AND column_name='isActive'",
                            [legacySchema],
                        )
                    ).rowCount,
                    0,
                );
                await pool.query(
                    'UPDATE "Equipment" SET "conditionStatus"=$1 WHERE "equipmentId"=1',
                    ["Inactive"],
                );
                await pool.query(
                    migration("20261018040000_equipment_lifecycle"),
                );
                const legacy = (
                    await pool.query(
                        'SELECT * FROM "Equipment" WHERE "equipmentId"=1',
                    )
                ).rows[0];
                assert.equal(legacy.isActive, false);
                assert.equal(legacy.conditionStatus, null);
                const audit = await pool.query(
                    'SELECT * FROM "AuditLog" WHERE "tableName"=$1 AND "actionType"=$2 ORDER BY "logId" DESC LIMIT 1',
                    ["Equipment", "UPDATE"],
                );
                assert.equal(
                    audit.rows[0].oldValue.conditionStatus,
                    "Inactive",
                );
                assert.equal(audit.rows[0].newValue.conditionStatus, null);
                await assert.rejects(
                    pool.query(
                        'UPDATE "Equipment" SET "isActive"=true WHERE "equipmentId"=1',
                    ),
                );
                await pool.query(
                    'UPDATE "Equipment" SET "isActive"=true,"conditionStatus"=$1 WHERE "equipmentId"=1',
                    ["Fair"],
                );
            } finally {
                await pool.end();
                await admin.query('DROP SCHEMA "' + legacySchema + '" CASCADE');
            }
        },
    );
};
