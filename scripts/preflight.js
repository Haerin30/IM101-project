// Read-only: an explicit URL is required; never load .env or fall back to DATABASE_URL.
const { Pool } = require("pg");
async function preflight(client) {
    const issues = [];
    const tables = [
        "Equipment",
        "MaintenanceRequest",
        "Reservation",
        "ReservationStatus",
        "EquipmentLoan",
        "ReservationEquipment",
        "Facility",
        "Building",
        "Role",
        "User",
    ];
    for (const table of tables) {
        const result = await client.query("SELECT to_regclass($1) AS name", [
            '"' + table + '"',
        ]);
        if (!result.rows[0].name)
            issues.push({ check: "missing_table", table });
    }
    if (issues.length)
        return {
            issues,
            legacyInactiveEquipment: [],
            migrations: [],
            note: "Base schema is missing. Inspect migration status before deploying.",
        };
    const checks = [
        [
            "maintenance_fields",
            `SELECT "requestId" AS id FROM "MaintenanceRequest" WHERE description !~ '[^[:space:]]' OR length(btrim(description))>2000 OR priority NOT IN ('Low','Normal','High','Urgent') OR status NOT IN ('Open','In Progress','Resolved') OR ("facilityId" IS NULL AND "equipmentId" IS NULL) OR (status IN ('In Progress','Resolved') AND "assignedStaffId" IS NULL) OR (status='Resolved' AND ("resolvedAt" IS NULL OR "resolutionNotes" IS NULL OR "resolutionNotes" !~ '[^[:space:]]' OR length(btrim("resolutionNotes"))>2000 OR "resolvedAt"<"reportedAt")) OR (status<>'Resolved' AND ("resolvedAt" IS NOT NULL OR "resolutionNotes" IS NOT NULL))`,
        ],
        [
            "maintenance_assignee",
            `SELECT m."requestId" AS id FROM "MaintenanceRequest" m LEFT JOIN "User" u ON u."userId"=m."assignedStaffId" LEFT JOIN "Role" r USING ("roleId") WHERE m.status<>'Resolved' AND m."assignedStaffId" IS NOT NULL AND (u."isActive" IS DISTINCT FROM true OR r."roleName" IS DISTINCT FROM 'Facility/Maintenance Staff')`,
        ],
        [
            "maintenance_location_review",
            `SELECT m."requestId" AS id FROM "MaintenanceRequest" m JOIN "Equipment" e USING ("equipmentId") WHERE m."facilityId" IS NOT NULL AND e."homeFacilityId" IS NOT NULL AND m."facilityId"<>e."homeFacilityId"`,
        ],
        [
            "equipment_values",
            `SELECT "equipmentId" AS id FROM "Equipment" e WHERE "totalQuantity"<=0 OR "availableQuantity"<0 OR "availableQuantity">"totalQuantity" OR "conditionStatus" NOT IN ('Good','Fair','Damaged','Inactive') OR ("conditionStatus" IS NULL AND COALESCE((to_jsonb(e)->>'isActive')::boolean,true)) OR "equipmentName" !~ '[^[:space:]]'`,
        ],
        [
            "equipment_stock",
            `SELECT "equipmentId" AS id FROM "Equipment" e WHERE "availableQuantity" <> "totalQuantity" - COALESCE((to_jsonb(e)->>'damagedQuantity')::integer,0) - COALESCE((SELECT sum(quantity) FROM "EquipmentLoan" l WHERE l."equipmentId"=e."equipmentId" AND l."loanStatus"='Borrowed'),0) - COALESCE((SELECT sum(i.quantity) FROM "ReservationEquipment" i JOIN "Reservation" r USING ("reservationId") JOIN "ReservationStatus" s USING ("statusId") WHERE i."equipmentId"=e."equipmentId" AND s."statusName" IN ('Pending','Approved')),0)`,
        ],
        [
            "retired_equipment_commitments",
            `SELECT "equipmentId" AS id FROM "Equipment" e WHERE ("conditionStatus" IN ('Inactive','Damaged') OR COALESCE((to_jsonb(e)->>'isActive')::boolean,true)=false) AND "availableQuantity"+COALESCE((to_jsonb(e)->>'damagedQuantity')::integer,0)<"totalQuantity"`,
        ],
        [
            "reservation_values",
            `SELECT "reservationId" AS id FROM "Reservation" r JOIN "ReservationStatus" s USING ("statusId") WHERE "endDatetime"<="startDatetime" OR purpose !~ '[^[:space:]]' OR length(btrim(purpose))>2000 OR s."statusName" NOT IN ('Pending','Approved','Rejected','Cancelled','Completed')`,
        ],
        [
            "reservation_overlap",
            `SELECT a."reservationId" AS id FROM "Reservation" a JOIN "ReservationStatus" sa ON sa."statusId"=a."statusId" JOIN "Reservation" b ON a."facilityId"=b."facilityId" AND a."reservationId"<b."reservationId" AND a."startDatetime"<b."endDatetime" AND a."endDatetime">b."startDatetime" JOIN "ReservationStatus" sb ON sb."statusId"=b."statusId" WHERE sa."statusName" IN ('Pending','Approved') AND sb."statusName" IN ('Pending','Approved')`,
        ],
        [
            "facility_values",
            `SELECT f."facilityId" AS id FROM "Facility" f JOIN "Building" b USING ("buildingId") WHERE capacity<=0 OR "floorNumber"<0 OR "floorNumber">b."floorCount" OR "facilityName" !~ '[^[:space:]]' OR status NOT IN ('Available','Maintenance','Inactive')`,
        ],
        [
            "building_values",
            `SELECT "buildingId" AS id FROM "Building" WHERE "floorCount"<=0`,
        ],
        [
            "allocation_quantity",
            `SELECT "reservationId" AS id FROM "ReservationEquipment" WHERE quantity<=0`,
        ],
        [
            "loan_values",
            `SELECT "loanId" AS id FROM "EquipmentLoan" WHERE quantity<=0 OR "dueDate"<="checkoutDate" OR "returnDate"<"checkoutDate" OR NOT (("loanStatus"='Borrowed' AND "returnDate" IS NULL) OR ("loanStatus"='Returned' AND "returnDate" IS NOT NULL AND "conditionIn" IS NOT NULL AND "conditionIn" IN ('Good','Fair','Damaged')))`,
        ],
    ];
    for (const [name, sql] of checks) {
        for (const row of (await client.query(sql)).rows)
            issues.push({ check: name, id: row.id });
    }
    const legacy = await client.query(
        `SELECT "equipmentId", "conditionStatus" FROM "Equipment" WHERE "conditionStatus"='Inactive' OR "conditionStatus" IS NULL ORDER BY "equipmentId"`,
    );
    const hasMigrations = (
        await client.query("SELECT to_regclass($1) AS name", [
            '"_prisma_migrations"',
        ])
    ).rows[0].name;
    const migrations = hasMigrations
        ? (
              await client.query(
                  'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
              )
          ).rows
        : [];
    return {
        issues,
        legacyInactiveEquipment: legacy.rows,
        migrations,
        note: "No data changed. Review every issue and migration status before deployment; clean output does not prove schema parity.",
    };
}
async function main() {
    if (!process.env.PREFLIGHT_DATABASE_URL)
        throw new Error("PREFLIGHT_DATABASE_URL must be explicitly provided.");
    const pool = new Pool({
        connectionString: process.env.PREFLIGHT_DATABASE_URL,
    });
    const client = await pool.connect();
    try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const result = await preflight(client);
        await client.query("ROLLBACK");
        console.log(JSON.stringify(result, null, 2));
        if (result.issues.length) process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}
if (require.main === module)
    main().catch(() => {
        console.error(
            "Preflight failed. Verify database access and schema using a trusted operator; credentials are not logged.",
        );
        process.exitCode = 1;
    });
module.exports = { preflight };
