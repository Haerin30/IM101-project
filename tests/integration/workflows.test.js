const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcrypt");
const { seed } = require("../../prisma/seed");
test("PostgreSQL integrity and API workflows", async (t) => {
    // No .env loading and no fallback to DATABASE_URL. Only an explicitly named local test DB.
    assert.ok(
        process.env.TEST_DATABASE_URL,
        "TEST_DATABASE_URL is required; integration tests must never silently skip.",
    );
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
            url.pathname.endsWith("_test"),
        "Use a loopback database whose name ends in _test.",
    );
    const schema = "test_" + randomBytes(8).toString("hex");
    const admin = new Pool({ connectionString: url.toString() });
    await admin.query('CREATE SCHEMA "' + schema + '"');
    const pool = new Pool({
        connectionString: url.toString(),
        options: "-c search_path=" + schema + ",public -c timezone=UTC",
    });
    const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    t.after(async () => {
        await db.$disconnect();
        await pool.end();
        await admin.query('DROP SCHEMA "' + schema + '" CASCADE');
        await admin.end();
    });
    for (const name of readdirSync(
        join(__dirname, "../../prisma/migrations"),
    ).sort()) {
        if (name.endsWith(".toml")) continue;
        const sql = readFileSync(
            join(__dirname, "../../prisma/migrations", name, "migration.sql"),
            "utf8",
        ).replace(/^\uFEFF/, "");
        await pool.query(sql);
    }
    await seed(db, {});
    const roles = await db.role.findMany();
    const password = "integration-test-password";
    const hash = await bcrypt.hash(password, 4);
    const adminUser = await db.user.create({
        data: {
            roleId: roles.find((r) => r.roleName === "System Administrator")
                .roleId,
            email: "admin@example.test",
            fname: "Admin",
            lname: "Test",
            passwordHash: hash,
        },
    });
    const member = await db.user.create({
        data: {
            roleId: roles.find((r) => r.roleName.includes("Faculty")).roleId,
            email: "member@example.test",
            fname: "Member",
            lname: "Test",
            passwordHash: hash,
        },
    });
    const building = await db.building.findFirst(),
        type = await db.facilityType.findFirst(),
        category = await db.equipmentCategory.findFirst();
    const facility = await db.facility.create({
        data: {
            buildingId: building.buildingId,
            facilityTypeId: type.facilityTypeId,
            facilityName: "Room A",
            floorNumber: 0,
            capacity: 20,
        },
    });
    const inactive = await db.facility.create({
        data: {
            buildingId: building.buildingId,
            facilityTypeId: type.facilityTypeId,
            facilityName: "Room B",
            floorNumber: 1,
            capacity: 20,
            status: "Inactive",
        },
    });
    const equipment = await db.equipment.create({
        data: {
            categoryId: category.categoryId,
            equipmentName: "Projector",
            totalQuantity: 3,
            availableQuantity: 3,
        },
    });
    require.cache[require.resolve("../../src/prisma")] = { exports: db };
    const { createApp } = require("../../src/app");
    let server = createApp({ database: db }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    let base = "http://127.0.0.1:" + server.address().port;
    async function request(path, method = "GET", body, token) {
        const res = await fetch(base + path, {
            method,
            headers: {
                ...(body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...(token ? { Authorization: "Bearer " + token } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: res.status, body: await res.json() };
    }
    const login = async (email) =>
        (await request("/api/auth/login", "POST", { email, password })).body
            .token;
    const adminToken = await login(adminUser.email),
        memberToken = await login(member.email);
    assert.ok(adminToken);
    assert.ok(memberToken);
    await t.test(
        "maintenance API, serializable workflow and PostgreSQL audit",
        async () => {
            const staffUser = await db.user.create({
                data: {
                    roleId: roles.find(
                        (r) => r.roleName === "Facility/Maintenance Staff",
                    ).roleId,
                    email: "staff@example.test",
                    fname: "Staff",
                    lname: "Test",
                    passwordHash: hash,
                },
            });
            const other = await db.user.create({
                data: {
                    roleId: member.roleId,
                    email: "maintenance-other@example.test",
                    fname: "Other",
                    lname: "Test",
                    passwordHash: hash,
                },
            });
            const staffToken = await login(staffUser.email),
                otherToken = await login(other.email);
            const root = "/api/maintenance-requests";
            const payload = {
                description: " Leaking pipe ",
                facilityId: facility.facilityId,
                equipmentId: equipment.equipmentId,
            };
            for (const [suffix, method, body] of [
                ["", "POST", payload],
                ["", "GET"],
                ["/1", "GET"],
                ["/1", "PATCH", { description: "x" }],
                ["/1/assign", "PATCH", { assignedStaffId: staffUser.userId }],
                ["/1/status", "PATCH", { status: "In Progress" }],
                ["/1/history", "GET"],
            ])
                assert.equal(
                    (await request(root + suffix, method, body)).status,
                    401,
                );
            for (const body of [
                { ...payload, description: " " },
                { ...payload, facilityId: "1x" },
                { description: "Issue" },
                { ...payload, reportedBy: other.userId },
                { ...payload, roleId: 1 },
                { ...payload, status: "Resolved" },
            ])
                assert.equal(
                    (await request(root, "POST", body, memberToken)).status,
                    400,
                );
            for (const key of ["facilityId", "equipmentId"])
                assert.equal(
                    (
                        await request(
                            root,
                            "POST",
                            { description: "Issue", [key]: 2147483647 },
                            memberToken,
                        )
                    ).status,
                    404,
                );
            const created = await request(root, "POST", payload, memberToken);
            assert.equal(created.status, 201, JSON.stringify(created));
            const id = created.body.data.requestId,
                path = root + "/" + id;
            assert.equal(created.body.data.reportedBy, member.userId);
            assert.equal(created.body.data.description, "Leaking pipe");
            assert.equal(
                (
                    await db.facility.findUnique({
                        where: { facilityId: facility.facilityId },
                    })
                ).status,
                "Available",
            );
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                3,
            );
            assert.equal(
                (await request(root, "GET", undefined, otherToken)).body.data
                    .length,
                0,
            );
            assert.equal(
                (await request(root, "GET", undefined, staffToken)).body.data
                    .length,
                1,
            );
            for (const suffix of ["", "/history"])
                assert.equal(
                    (await request(path + suffix, "GET", undefined, otherToken))
                        .status,
                    403,
                );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { description: "Changed" },
                        otherToken,
                    )
                ).status,
                403,
            );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { description: "Updated leak" },
                        memberToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { priority: "Urgent" },
                        memberToken,
                    )
                ).status,
                400,
            );
            assert.equal(
                (
                    await request(
                        path + "/assign",
                        "PATCH",
                        { assignedStaffId: staffUser.userId },
                        memberToken,
                    )
                ).status,
                403,
            );
            assert.equal(
                (
                    await request(
                        path + "/status",
                        "PATCH",
                        { status: "In Progress" },
                        memberToken,
                    )
                ).status,
                403,
            );
            for (const assignedStaffId of [
                member.userId,
                adminUser.userId,
                2147483647,
            ])
                assert.equal(
                    (
                        await request(
                            path + "/assign",
                            "PATCH",
                            { assignedStaffId },
                            staffToken,
                        )
                    ).status,
                    400,
                );
            await db.user.update({
                where: { userId: staffUser.userId },
                data: { isActive: false },
            });
            assert.equal(
                (
                    await request(
                        path + "/assign",
                        "PATCH",
                        { assignedStaffId: staffUser.userId },
                        adminToken,
                    )
                ).status,
                400,
            );
            await db.user.update({
                where: { userId: staffUser.userId },
                data: { isActive: true },
            });
            const activeStaffToken = await login(staffUser.email);
            assert.equal(
                (
                    await request(
                        path + "/assign",
                        "PATCH",
                        { assignedStaffId: staffUser.userId },
                        activeStaffToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { priority: "Urgent" },
                        activeStaffToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        path + "/status",
                        "PATCH",
                        { status: "Resolved", resolutionNotes: "Fixed" },
                        activeStaffToken,
                    )
                ).status,
                409,
            );
            const concurrent = await Promise.all([
                request(
                    path + "/status",
                    "PATCH",
                    { status: "In Progress" },
                    activeStaffToken,
                ),
                request(
                    path + "/status",
                    "PATCH",
                    { status: "In Progress" },
                    adminToken,
                ),
            ]);
            assert.equal(
                concurrent.filter((r) => r.status === 200).length,
                1,
                JSON.stringify(concurrent),
            );
            assert.equal(
                concurrent.filter((r) => r.status === 409).length,
                1,
                JSON.stringify(concurrent),
            );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { description: "Late edit" },
                        memberToken,
                    )
                ).status,
                409,
            );
            for (const resolutionNotes of [undefined, " "])
                assert.equal(
                    (
                        await request(
                            path + "/status",
                            "PATCH",
                            { status: "Resolved", resolutionNotes },
                            activeStaffToken,
                        )
                    ).status,
                    400,
                );
            const resolved = await request(
                path + "/status",
                "PATCH",
                { status: "Resolved", resolutionNotes: "Replaced seal" },
                activeStaffToken,
            );
            assert.equal(resolved.status, 200, JSON.stringify(resolved));
            assert.ok(resolved.body.data.resolvedAt);
            for (const token of [adminToken, activeStaffToken]) {
                assert.equal(
                    (
                        await request(
                            path,
                            "PATCH",
                            { description: "Rewrite" },
                            token,
                        )
                    ).status,
                    409,
                );
                assert.equal(
                    (
                        await request(
                            path + "/assign",
                            "PATCH",
                            { assignedStaffId: staffUser.userId },
                            token,
                        )
                    ).status,
                    409,
                );
                assert.equal(
                    (
                        await request(
                            path + "/status",
                            "PATCH",
                            { status: "Open" },
                            token,
                        )
                    ).status,
                    409,
                );
            }
            const history = await request(
                path + "/history",
                "GET",
                undefined,
                memberToken,
            );
            assert.equal(history.status, 200);
            assert.equal(history.body.data.length, 6);
            assert.equal(history.body.data[0].actionType, "INSERT");
            assert.equal(history.body.data[0].changedBy, member.userId);
            assert.equal(history.body.data[0].oldValue, null);
            assert.equal(history.body.data.at(-1).newValue.status, "Resolved");
            assert.equal(
                history.body.data.at(-1).oldValue.status,
                "In Progress",
            );
            assert.equal(history.body.data.at(-1).changedBy, staffUser.userId);
            assert.equal(
                JSON.stringify(history.body).includes("passwordHash"),
                false,
            );
            // The existing trigger audits direct SQL too, and audit writes roll back atomically.
            const before = await db.auditLog.count({
                where: { tableName: "MaintenanceRequest" },
            });
            await assert.rejects(
                db.$transaction(async (tx) => {
                    await tx.maintenanceRequest.create({
                        data: {
                            facilityId: facility.facilityId,
                            reportedBy: member.userId,
                            description: "Rollback",
                        },
                    });
                    throw new Error("intentional rollback");
                }),
            );
            assert.equal(
                await db.auditLog.count({
                    where: { tableName: "MaintenanceRequest" },
                }),
                before,
            );
            const direct = await db.maintenanceRequest.create({
                data: {
                    equipmentId: equipment.equipmentId,
                    description: "Direct database event",
                },
            });
            const directLog = await db.auditLog.findFirst({
                where: {
                    tableName: "MaintenanceRequest",
                    recordId: direct.requestId,
                },
            });
            assert.equal(directLog.actionType, "INSERT");
            assert.equal(directLog.changedBy, null);
        },
    );
    await require("./hardening")(t, {
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
    });
    const at = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
    const payload = {
        facilityId: facility.facilityId,
        purpose: "Meeting",
        startDatetime: at(48),
        endDatetime: at(49),
    };
    let booking;
    await t.test(
        "validation, inactive facilities, and member permissions",
        async () => {
            assert.equal(
                (
                    await request(
                        "/api/reservations",
                        "POST",
                        { ...payload, purpose: " " },
                        memberToken,
                    )
                ).status,
                400,
            );
            assert.equal(
                (
                    await request(
                        "/api/reservations",
                        "POST",
                        { ...payload, facilityId: inactive.facilityId },
                        memberToken,
                    )
                ).status,
                409,
            );
            assert.equal(
                (await request("/api/equipment", "POST", {}, memberToken))
                    .status,
                403,
            );
            assert.equal(
                (await request("/api/loans", "POST", {}, memberToken)).status,
                403,
            );
        },
    );
    await t.test(
        "simultaneous overlaps allow exactly one booking",
        async () => {
            const results = await Promise.all([
                request("/api/reservations", "POST", payload, memberToken),
                request("/api/reservations", "POST", payload, memberToken),
            ]);
            assert.equal(
                results.filter((r) => r.status === 201).length,
                1,
                JSON.stringify(results),
            );
            assert.equal(
                results.filter((r) => r.status === 409).length,
                1,
                JSON.stringify(results),
            );
            booking = results.find((r) => r.status === 201).body.data;
            const adjacent = await request(
                "/api/reservations",
                "POST",
                {
                    ...payload,
                    startDatetime: payload.endDatetime,
                    endDatetime: at(50),
                },
                memberToken,
            );
            assert.equal(adjacent.status, 201, JSON.stringify(adjacent));
            assert.equal(
                (
                    await request(
                        "/api/reservations/" +
                            adjacent.body.data.reservationId +
                            "/status",
                        "PATCH",
                        { status: "Cancelled" },
                        memberToken,
                    )
                ).status,
                200,
            );
        },
    );
    await t.test(
        "ownership, lifecycle, audit history, and cancellation release",
        async () => {
            const id = booking.reservationId;
            assert.equal(
                (
                    await request(
                        "/api/reservations/" + id + "/status",
                        "PATCH",
                        { status: "Approved" },
                        memberToken,
                    )
                ).status,
                403,
            );
            assert.equal(
                (
                    await request(
                        "/api/reservations/" + id + "/status",
                        "PATCH",
                        { status: "Approved" },
                        adminToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        "/api/reservations/" + id,
                        "PUT",
                        { purpose: "Changed" },
                        memberToken,
                    )
                ).status,
                409,
            );
            assert.equal(
                (
                    await request(
                        "/api/reservations/" + id + "/status",
                        "PATCH",
                        { status: "Completed" },
                        adminToken,
                    )
                ).status,
                409,
            );
            assert.equal(
                (
                    await request(
                        "/api/facilities/" + facility.facilityId,
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
                        "/api/reservations/" + id + "/status",
                        "PATCH",
                        { status: "Cancelled" },
                        memberToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request(
                        "/api/reservations/" + id + "/status",
                        "PATCH",
                        { status: "Approved" },
                        adminToken,
                    )
                ).status,
                409,
            );
            const history = await request(
                "/api/reservations/" + id + "/history",
                "GET",
                undefined,
                memberToken,
            );
            assert.equal(history.status, 200);
            assert.equal(history.body.data.length, 3);
            assert.equal(history.body.data[1].changedBy, adminUser.userId);
        },
    );
    let loan;
    await t.test(
        "concurrent loans cannot oversell and returns are idempotent",
        async () => {
            const b = {
                equipmentId: equipment.equipmentId,
                userId: member.userId,
                quantity: 2,
                dueDate: at(24),
            };
            const results = await Promise.all([
                request("/api/loans", "POST", b, adminToken),
                request("/api/loans", "POST", b, adminToken),
            ]);
            assert.equal(
                results.filter((r) => r.status === 201).length,
                1,
                JSON.stringify(results),
            );
            assert.equal(
                results.filter((r) => r.status === 409).length,
                1,
                JSON.stringify(results),
            );
            loan = results.find((r) => r.status === 201).body.data;
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                1,
            );
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + equipment.equipmentId,
                        "PUT",
                        { totalQuantity: 1 },
                        adminToken,
                    )
                ).status,
                409,
            );
            const returned = await request(
                "/api/loans/" + loan.loanId + "/return",
                "POST",
                { conditionIn: "Good" },
                adminToken,
            );
            assert.equal(returned.status, 200, JSON.stringify(returned));
            assert.equal(
                (
                    await request(
                        "/api/loans/" + loan.loanId + "/return",
                        "POST",
                        { conditionIn: "Good" },
                        adminToken,
                    )
                ).status,
                409,
            );
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                3,
            );
        },
    );
    await t.test(
        "equipment allocations reserve stock and cancellation releases it",
        async () => {
            const b = {
                ...payload,
                equipmentItems: [
                    { equipmentId: equipment.equipmentId, quantity: 3 },
                ],
            };
            const result = await request(
                "/api/reservations",
                "POST",
                b,
                memberToken,
            );
            assert.equal(result.status, 201, JSON.stringify(result));
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                0,
            );
            const over = await request(
                "/api/loans",
                "POST",
                {
                    equipmentId: equipment.equipmentId,
                    userId: member.userId,
                    quantity: 1,
                    dueDate: at(24),
                },
                adminToken,
            );
            assert.equal(over.status, 409, JSON.stringify(over));
            assert.equal(
                (
                    await request(
                        "/api/equipment/" + equipment.equipmentId,
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
                        "/api/reservations/" +
                            result.body.data.reservationId +
                            "/status",
                        "PATCH",
                        { status: "Cancelled" },
                        memberToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                3,
            );
        },
    );
    await t.test(
        "database rejects invalid dates, quantities, direct overlap and stock edits",
        async () => {
            const status = await db.reservationStatus.findUnique({
                where: { statusName: "Pending" },
            });
            const data = {
                facilityId: facility.facilityId,
                requestedBy: member.userId,
                statusId: status.statusId,
                purpose: "Direct",
                startDatetime: new Date(at(60)),
                endDatetime: new Date(at(61)),
            };
            await assert.rejects(
                db.reservation.create({
                    data: { ...data, endDatetime: data.startDatetime },
                }),
            );
            const direct = await db.reservation.create({ data });
            await assert.rejects(db.reservation.create({ data }));
            const derived = await db.reservation.update({
                where: { reservationId: direct.reservationId },
                data: { blocksSchedule: false },
            });
            assert.equal(derived.blocksSchedule, true);
            await assert.rejects(
                db.equipment.update({
                    where: { equipmentId: equipment.equipmentId },
                    data: { availableQuantity: 1 },
                }),
            );
            await assert.rejects(
                db.reservationEquipment.create({
                    data: {
                        reservationId: direct.reservationId,
                        equipmentId: equipment.equipmentId,
                        quantity: -1,
                    },
                }),
            );
            await assert.rejects(
                db.equipmentLoan.update({
                    where: { loanId: loan.loanId },
                    data: { quantity: 1 },
                }),
            );
        },
    );
    await t.test(
        "damaged returns stay unavailable until a recorded repair",
        async () => {
            const result = await request(
                "/api/loans",
                "POST",
                {
                    equipmentId: equipment.equipmentId,
                    userId: member.userId,
                    quantity: 2,
                    dueDate: at(24),
                },
                adminToken,
            );
            assert.equal(result.status, 201, JSON.stringify(result));
            const returned = await request(
                "/api/loans/" + result.body.data.loanId + "/return",
                "POST",
                { conditionIn: "Damaged" },
                adminToken,
            );
            assert.equal(returned.status, 200, JSON.stringify(returned));
            const damaged = await db.equipment.findUnique({
                where: { equipmentId: equipment.equipmentId },
            });
            assert.equal(damaged.availableQuantity, 1);
            assert.equal(damaged.damagedQuantity, 2);
            const path = "/api/equipment/" + equipment.equipmentId + "/repair";
            assert.equal(
                (await request(path, "POST", { quantity: 1 }, memberToken))
                    .status,
                403,
            );
            assert.equal(
                (await request(path, "POST", { quantity: 3 }, adminToken))
                    .status,
                409,
            );
            const repaired = await request(
                path,
                "POST",
                { quantity: 2 },
                adminToken,
            );
            assert.equal(repaired.status, 200, JSON.stringify(repaired));
            assert.equal(repaired.body.data.availableQuantity, 3);
            assert.equal(repaired.body.data.damagedQuantity, 0);
        },
    );
    await t.test(
        "completion after end time releases stock and records history",
        async () => {
            const start = new Date(Date.now() + 1500),
                end = new Date(Date.now() + 2500);
            const result = await request(
                "/api/reservations",
                "POST",
                {
                    ...payload,
                    startDatetime: start.toISOString(),
                    endDatetime: end.toISOString(),
                    equipmentItems: [
                        { equipmentId: equipment.equipmentId, quantity: 1 },
                    ],
                },
                memberToken,
            );
            assert.equal(result.status, 201, JSON.stringify(result));
            const path =
                "/api/reservations/" +
                result.body.data.reservationId +
                "/status";
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { status: "Approved" },
                        adminToken,
                    )
                ).status,
                200,
            );
            await new Promise((resolve) =>
                setTimeout(
                    resolve,
                    Math.max(0, end.getTime() - Date.now() + 50),
                ),
            );
            assert.equal(
                (
                    await request(
                        path,
                        "PATCH",
                        { status: "Completed" },
                        adminToken,
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await db.equipment.findUnique({
                        where: { equipmentId: equipment.equipmentId },
                    })
                ).availableQuantity,
                3,
            );
        },
    );
    await t.test(
        "only owners can edit, cancel, or inspect reservation history",
        async () => {
            const other = await db.user.create({
                data: {
                    roleId: member.roleId,
                    email: "other@example.test",
                    fname: "Other",
                    lname: "User",
                    passwordHash: hash,
                },
            });
            const token = await login(other.email);
            for (const [method, path, b] of [
                ["GET", "/api/reservations/" + booking.reservationId],
                [
                    "GET",
                    "/api/reservations/" + booking.reservationId + "/history",
                ],
                [
                    "PUT",
                    "/api/reservations/" + booking.reservationId,
                    { purpose: "Changed" },
                ],
                [
                    "PATCH",
                    "/api/reservations/" + booking.reservationId + "/status",
                    { status: "Cancelled" },
                ],
            ]) {
                assert.equal(
                    (await request(path, method, b, token)).status,
                    403,
                );
            }
        },
    );
    await t.test(
        "password rotation invalidates all existing sessions",
        async () => {
            const token = await login(member.email);
            await db.user.update({
                where: { userId: member.userId },
                data: {
                    passwordHash: await bcrypt.hash("new-test-password", 4),
                },
            });
            assert.equal(
                (await request("/api/auth/me", "GET", undefined, token)).status,
                401,
            );
            await db.user.update({
                where: { userId: member.userId },
                data: { passwordHash: hash },
            });
        },
    );
    await t.test(
        "persistent sessions survive a fresh app and logout revokes across instances",
        async () => {
            const second = createApp({ database: db }).listen(0, "127.0.0.1");
            await new Promise((resolve) => second.once("listening", resolve));
            const oldBase = base;
            base = "http://127.0.0.1:" + second.address().port;
            try {
                assert.equal(
                    (
                        await request(
                            "/api/auth/me",
                            "GET",
                            undefined,
                            adminToken,
                        )
                    ).status,
                    200,
                );
                assert.equal(
                    (
                        await request(
                            "/api/auth/logout",
                            "POST",
                            undefined,
                            adminToken,
                        )
                    ).status,
                    200,
                );
                base = oldBase;
                assert.equal(
                    (
                        await request(
                            "/api/auth/me",
                            "GET",
                            undefined,
                            adminToken,
                        )
                    ).status,
                    401,
                );
            } finally {
                base = oldBase;
                await new Promise((resolve) => second.close(resolve));
            }
        },
    );
    await t.test(
        "migration rolls back on invalid legacy data and retires legacy demo accounts",
        async () => {
            const legacySchema = schema + "_legacy";
            await admin.query('CREATE SCHEMA "' + legacySchema + '"');
            const legacy = new Pool({
                connectionString: url.toString(),
                options:
                    "-c search_path=" +
                    legacySchema +
                    ",public -c timezone=UTC",
            });
            try {
                const root = join(__dirname, "../../prisma/migrations");
                for (const name of [
                    "20260927063702_init",
                    "20261004052212_split_user_name",
                ])
                    await legacy.query(
                        readFileSync(join(root, name, "migration.sql"), "utf8"),
                    );
                await legacy.query(`INSERT INTO "Role" ("roleName") VALUES ('System Administrator');
                INSERT INTO "User" ("roleId",fname,lname,email,"idNumber","passwordHash") VALUES (1,'Admin','User','admin@campus.local','ADM-001','legacy-hash');
                INSERT INTO "Building" ("buildingName","floorCount") VALUES ('Legacy',2);
                INSERT INTO "FacilityType" ("typeName") VALUES ('Classroom');
                INSERT INTO "Facility" ("buildingId","facilityTypeId","facilityName","floorNumber",capacity) VALUES (1,1,'Legacy',0,10);
                INSERT INTO "ReservationStatus" ("statusName") VALUES ('Pending');
                INSERT INTO "Reservation" ("facilityId","requestedBy","statusId",purpose,"startDatetime","endDatetime") VALUES (1,1,1,'Legacy',now()+interval '2 day',now()+interval '1 day');`);
                const migration = readFileSync(
                    join(root, "20261018010000_integrity/migration.sql"),
                    "utf8",
                ).replace(/^\uFEFF/, "");
                await assert.rejects(legacy.query(migration));
                await legacy.query("ROLLBACK");
                const columns = await legacy.query(
                    "SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name='Reservation' AND column_name='blocksSchedule'",
                    [legacySchema],
                );
                assert.equal(columns.rowCount, 0);
                await legacy.query('DELETE FROM "Reservation"');
                await legacy.query(migration);
                assert.equal(
                    (
                        await legacy.query(
                            'SELECT "isActive" FROM "User" WHERE "userId"=1',
                        )
                    ).rows[0].isActive,
                    false,
                );
            } finally {
                await legacy.end();
                await admin.query('DROP SCHEMA "' + legacySchema + '" CASCADE');
            }
        },
    );
    await t.test(
        "seed preserves changed password and disabled accounts",
        async () => {
            await db.user.update({
                where: { userId: adminUser.userId },
                data: { isActive: false },
            });
            await seed(db, {
                SEED_ADMIN_EMAIL: adminUser.email,
                SEED_ADMIN_PASSWORD: "different-long-seed-password",
            });
            const row = await db.user.findUnique({
                where: { userId: adminUser.userId },
            });
            assert.equal(row.passwordHash, hash);
            assert.equal(row.isActive, false);
        },
    );
});
