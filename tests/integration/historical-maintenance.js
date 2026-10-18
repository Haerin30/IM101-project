const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { Pool } = require("pg");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { preflight } = require("../../scripts/preflight");
const { ROLES } = require("../../src/auth");
module.exports = async function historicalMaintenance(
    t,
    { admin, url, schema },
) {
    await t.test(
        "historical maintenance survives migration, relocation and staff assignment",
        async () => {
            const name = schema + "_history";
            await admin.query('CREATE SCHEMA "' + name + '"');
            const pool = new Pool({
                connectionString: url.toString(),
                options: "-c search_path=" + name + ",public -c timezone=UTC",
            });
            const db = new PrismaClient({
                adapter: new PrismaPg(pool, { schema: name }),
            });
            try {
                const root = join(__dirname, "../../prisma/migrations");
                const files = readdirSync(root)
                    .filter((x) => !x.endsWith(".toml"))
                    .sort();
                const migrate = async (file) =>
                    pool.query(
                        readFileSync(
                            join(root, file, "migration.sql"),
                            "utf8",
                        ).replace(/^\uFEFF/, ""),
                    );
                for (const file of files.filter((x) => x < "20261018030000"))
                    await migrate(file);
                await pool.query(`INSERT INTO "Role" ("roleName") VALUES ('System Administrator'),('Facility/Maintenance Staff'),('Faculty Member / Student Organization Representative');
                INSERT INTO "User" ("roleId",fname,lname,email,"passwordHash") VALUES
                (1,'Admin','Test','history-admin@example.test','test-only'),(2,'Staff','Test','history-staff@example.test','test-only'),(3,'Member','Test','history-member@example.test','test-only');
                INSERT INTO "Building" ("buildingName","floorCount") VALUES ('History building',2);
                INSERT INTO "FacilityType" ("typeName") VALUES ('History room');
                INSERT INTO "Facility" ("buildingId","facilityTypeId","facilityName","floorNumber",capacity) VALUES (1,1,'Original room',0,10),(1,1,'New room',0,10);
                INSERT INTO "EquipmentCategory" ("categoryName") VALUES ('History category');
                INSERT INTO "Equipment" ("categoryId","equipmentName","homeFacilityId","totalQuantity","availableQuantity") VALUES (1,'Moved projector',1,2,2);
                SELECT set_config('app.user_id','3',false);
                INSERT INTO "MaintenanceRequest" ("facilityId","equipmentId","reportedBy",description,status,"resolvedAt","resolutionNotes") VALUES
                (1,1,3,'Historical resolved report','Resolved',CURRENT_TIMESTAMP,'Verified historical repair'),
                (1,1,3,'Historical work in progress','In Progress',NULL,NULL),
                (1,1,3,'Historical open report','Open',NULL,NULL);
                UPDATE "Equipment" SET "homeFacilityId"=2 WHERE "equipmentId"=1;
                SELECT set_config('app.user_id','',false);`);
                const before = (
                    await pool.query(
                        'SELECT * FROM "MaintenanceRequest" ORDER BY "requestId"',
                    )
                ).rows;
                const auditBefore = (
                    await pool.query(
                        'SELECT * FROM "AuditLog" WHERE "tableName"=$1 ORDER BY "logId"',
                        ["MaintenanceRequest"],
                    )
                ).rows;
                const review = await preflight(pool);
                assert.deepEqual(review.issues, []);
                assert.equal(
                    review.warnings.filter(
                        (r) =>
                            r.check ===
                            "maintenance_missing_historical_assignment",
                    ).length,
                    2,
                );
                assert.equal(
                    review.warnings.filter(
                        (r) => r.check === "maintenance_location_review",
                    ).length,
                    3,
                );
                for (const file of files.filter((x) => x >= "20261018030000"))
                    await migrate(file);
                assert.deepEqual(
                    (
                        await pool.query(
                            'SELECT * FROM "MaintenanceRequest" ORDER BY "requestId"',
                        )
                    ).rows,
                    before,
                );
                assert.deepEqual(
                    (
                        await pool.query(
                            'SELECT * FROM "AuditLog" WHERE "tableName"=$1 ORDER BY "logId"',
                            ["MaintenanceRequest"],
                        )
                    ).rows,
                    auditBefore,
                );
                assert.equal(auditBefore[0].changedBy, 3);
                // Unchanged legacy null assignments must survive ordinary updates too.
                await pool.query(
                    'UPDATE "MaintenanceRequest" SET description=description WHERE "requestId"=2',
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET "assignedStaffId"=3 WHERE "requestId"=2',
                    ),
                );
                // Run the real API controller against this independently migrated PostgreSQL schema.
                const context = {
                    module: { exports: {} },
                    require(id) {
                        return id === "../prisma"
                            ? db
                            : require("../../src/" + id.replace("../", ""));
                    },
                };
                vm.runInNewContext(
                    readFileSync(
                        join(
                            __dirname,
                            "../../src/controllers/maintenance.controller.js",
                        ),
                        "utf8",
                    ),
                    context,
                );
                const c = context.module.exports;
                async function call(
                    handler,
                    body = {},
                    id = "1",
                    role = ROLES.ADMIN,
                    userId = 1,
                ) {
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
                    await c[handler](
                        {
                            body,
                            params: { id },
                            user: { userId, role: { roleName: role } },
                        },
                        res,
                    );
                    return res;
                }
                assert.equal(
                    (await call("getRequest", {}, "1", ROLES.MEMBER, 3))
                        .statusCode,
                    200,
                );
                assert.equal(
                    (await call("getHistory", {}, "1", ROLES.MEMBER, 3)).body
                        .data[0].changedBy,
                    3,
                );
                assert.equal(
                    (await call("getRequest", {}, "1", ROLES.MEMBER, 2))
                        .statusCode,
                    403,
                );
                assert.equal(
                    (await call("editRequest", { description: "Rewrite" }))
                        .statusCode,
                    409,
                );
                assert.equal(
                    (await call("assignRequest", { assignedStaffId: 2 }))
                        .statusCode,
                    409,
                );
                assert.equal(
                    (await call("updateStatus", { status: "Open" })).statusCode,
                    409,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET description=$1 WHERE "requestId"=1',
                        ["Changed"],
                    ),
                );
                await assert.rejects(
                    pool.query(
                        'DELETE FROM "MaintenanceRequest" WHERE "requestId"=1',
                    ),
                );
                const resolve = {
                    status: "Resolved",
                    resolutionNotes: "Completed now",
                };
                assert.equal(
                    (await call("updateStatus", resolve, "2")).statusCode,
                    409,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET status=$1,"resolutionNotes"=$2,"resolvedAt"=CURRENT_TIMESTAMP WHERE "requestId"=2',
                        ["Resolved", "Completed now"],
                    ),
                );
                assert.equal(
                    (
                        await call(
                            "assignRequest",
                            { assignedStaffId: 2 },
                            "2",
                            ROLES.MEMBER,
                            3,
                        )
                    ).statusCode,
                    403,
                );
                assert.equal(
                    (await call("assignRequest", { assignedStaffId: 2 }, "2"))
                        .statusCode,
                    200,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET "assignedStaffId"=NULL WHERE "requestId"=2',
                    ),
                );
                await db.user.update({
                    where: { userId: 2 },
                    data: { isActive: false },
                });
                assert.equal(
                    (await call("updateStatus", resolve, "2")).statusCode,
                    409,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET status=$1,"resolutionNotes"=$2,"resolvedAt"=CURRENT_TIMESTAMP WHERE "requestId"=2',
                        ["Resolved", "Completed now"],
                    ),
                );
                await db.user.update({
                    where: { userId: 2 },
                    data: { isActive: true },
                });
                assert.equal(
                    (await call("updateStatus", resolve, "2")).statusCode,
                    200,
                );
                const history = (await call("getHistory", {}, "2")).body.data;
                assert.equal(history.length, 4);
                assert.equal(history[2].oldValue.assignedStaffId, null);
                assert.equal(history[2].newValue.assignedStaffId, 2);
                assert.equal(history[2].changedBy, 1);
                assert.equal(history[3].changedBy, 1);
                assert.equal(
                    (await call("updateStatus", { status: "In Progress" }, "3"))
                        .statusCode,
                    409,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET status=$1 WHERE "requestId"=3',
                        ["In Progress"],
                    ),
                );
                // New creation uses the present location, unlike old history.
                assert.equal(
                    (
                        await call("createRequest", {
                            description: "New mismatch",
                            facilityId: 1,
                            equipmentId: 1,
                        })
                    ).statusCode,
                    400,
                );
                await assert.rejects(
                    pool.query(
                        'INSERT INTO "MaintenanceRequest" ("facilityId","equipmentId",description) VALUES (1,1,$1)',
                        ["New mismatch"],
                    ),
                );
                assert.equal(
                    (
                        await call("createRequest", {
                            description: "Current room",
                            facilityId: 2,
                            equipmentId: 1,
                        })
                    ).statusCode,
                    201,
                );
                await db.equipment.update({
                    where: { equipmentId: 1 },
                    data: { homeFacilityId: null },
                });
                assert.equal(
                    (
                        await call("createRequest", {
                            description: "Portable",
                            facilityId: 1,
                            equipmentId: 1,
                        })
                    ).statusCode,
                    201,
                );
                await db.equipment.update({
                    where: { equipmentId: 1 },
                    data: { homeFacilityId: 2 },
                });
                assert.equal(
                    (await call("getRequest", {}, "1")).body.data.facilityId,
                    1,
                );
                await assert.rejects(
                    pool.query(
                        'UPDATE "MaintenanceRequest" SET "facilityId"=2 WHERE "requestId"=3',
                    ),
                );
                assert.equal(
                    (await call("editRequest", { facilityId: 2 }, "3"))
                        .statusCode,
                    400,
                );
                assert.equal(
                    (await call("updateStatus", { status: "Open" }, "2"))
                        .statusCode,
                    409,
                );
                const after = await preflight(pool);
                assert.deepEqual(after.issues, []);
                assert.ok(after.warnings.length > 0);
            } finally {
                await db.$disconnect();
                await pool.end();
                await admin.query('DROP SCHEMA "' + name + '" CASCADE');
            }
        },
    );
};
