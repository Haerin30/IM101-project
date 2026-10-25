const assert = require("node:assert/strict");
const fs = require("node:fs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("node:crypto");
const { createApp } = require("../../src/app");
async function run(context) {
    const { pool, prisma, check } = context;
    for (const role of [
        "im101_core_owner",
        "im101_core_runtime",
        "im101_core_audit_writer",
    ])
        await pool.query(
            `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`,
        );
    await pool.query(
        fs.readFileSync(
            "prisma/migrations/20261027010000_core_loan_workflow/migration.sql",
            "utf8",
        ),
    );
    await pool.query(
        "GRANT im101_core_runtime TO im101_test_runtime; INSERT INTO equipment(equipment_id,category_id,equipment_name,total_quantity,available_quantity) VALUES(100,1,'Core fixture',1,1),(101,1,'Core fixture two',2,2)",
    );
    const secret = randomBytes(48).toString("hex");
    const server = createApp({
        getPrisma: () => prisma,
        jwtSecret: secret,
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    async function request(method, path, body, user = 301) {
        const authorization =
            "Bearer " +
            jwt.sign({}, secret, {
                subject: String(user),
                issuer: "im101-api",
                audience: "im101-client",
                expiresIn: "15m",
            });
        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/api${path}`,
            {
                method,
                headers: {
                    Authorization: authorization,
                    "Content-Type": "application/json",
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            },
        );
        const result = await response.json();
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.ok(!JSON.stringify(result).includes("passwordHash"));
        return { status: response.status, body: result };
    }
    const payload = (equipmentId = 100) => ({
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
        items: [{ equipmentId, quantity: 1 }],
    });
    try {
        await check(
            "loan request review return and history use real database inventory exactly once",
            async () => {
                const created = await request("POST", "/loans", payload());
                assert.equal(created.status, 201, "CHECK_LOAN_CREATE");
                const id = created.body.loan.loanId;
                assert.equal(
                    (await request("GET", `/loans/${id}`, undefined, 401))
                        .status,
                    403,
                );
                assert.equal(
                    (await request("POST", `/loans/${id}/approve`, {}, 101))
                        .status,
                    200,
                    "CHECK_LOAN_APPROVE",
                );
                assert.equal(
                    (
                        await prisma.equipment.findUnique({
                            where: { equipmentId: 100 },
                        })
                    ).availableQuantity,
                    0,
                );
                assert.equal(
                    (await request("POST", `/loans/${id}/approve`, {}, 101))
                        .status,
                    409,
                );
                assert.equal(
                    (
                        await request(
                            "POST",
                            `/loans/${id}/return`,
                            {
                                items: [
                                    { equipmentId: 100, conditionIn: "Good" },
                                ],
                            },
                            201,
                        )
                    ).status,
                    200,
                    "CHECK_LOAN_RETURN",
                );
                assert.equal(
                    (
                        await request(
                            "POST",
                            `/loans/${id}/return`,
                            {
                                items: [
                                    { equipmentId: 100, conditionIn: "Good" },
                                ],
                            },
                            201,
                        )
                    ).status,
                    409,
                );
                assert.equal(
                    (
                        await prisma.equipment.findUnique({
                            where: { equipmentId: 100 },
                        })
                    ).availableQuantity,
                    1,
                );
                assert.equal(
                    (await request("GET", "/loans?status=Returned")).body
                        .loans[0].loanStatus,
                    "Returned",
                );
            },
        );
        await check(
            "concurrent loan approvals cannot consume the last item twice",
            async () => {
                const a = await request("POST", "/loans", payload(), 301),
                    b = await request("POST", "/loans", payload(), 201);
                assert.equal(a.status, 201);
                assert.equal(b.status, 201);
                const outcomes = await Promise.all([
                    request(
                        "POST",
                        `/loans/${a.body.loan.loanId}/approve`,
                        {},
                        101,
                    ),
                    request(
                        "POST",
                        `/loans/${b.body.loan.loanId}/approve`,
                        {},
                        102,
                    ),
                ]);
                assert.deepEqual(
                    outcomes.map((r) => r.status).sort(),
                    [200, 409],
                );
                assert.equal(
                    (
                        await prisma.equipment.findUnique({
                            where: { equipmentId: 100 },
                        })
                    ).availableQuantity,
                    0,
                );
                const winner = outcomes[0].status === 200 ? a : b;
                assert.equal(
                    (
                        await request(
                            "POST",
                            `/loans/${winner.body.loan.loanId}/return`,
                            {
                                items: [
                                    {
                                        equipmentId: 100,
                                        conditionIn: "Damaged",
                                    },
                                ],
                            },
                            101,
                        )
                    ).status,
                    200,
                );
                const equipment = await prisma.equipment.findUnique({
                    where: { equipmentId: 100 },
                });
                assert.equal(equipment.availableQuantity, 1);
                assert.equal(equipment.conditionStatus, "Damaged");
                assert.equal(
                    (await request("POST", "/loans", payload())).status,
                    409,
                );
            },
        );
        await check(
            "loan ownership self-review invalid quantities and inventory bounds are enforced",
            async () => {
                const own = await request("POST", "/loans", payload(101), 201);
                assert.equal(own.status, 201);
                assert.equal(
                    (
                        await request(
                            "POST",
                            `/loans/${own.body.loan.loanId}/approve`,
                            {},
                            201,
                        )
                    ).status,
                    403,
                );
                assert.equal(
                    (
                        await request(
                            "GET",
                            `/loans/${own.body.loan.loanId}`,
                            undefined,
                            301,
                        )
                    ).status,
                    404,
                );
                assert.equal(
                    (
                        await request(
                            "POST",
                            `/loans/${own.body.loan.loanId}/reject`,
                            {},
                            101,
                        )
                    ).status,
                    200,
                );
                assert.equal(
                    (
                        await request("POST", "/loans", {
                            ...payload(101),
                            userId: 201,
                        })
                    ).status,
                    400,
                );
                await assert.rejects(
                    pool.query(
                        "UPDATE equipment SET available_quantity=-1 WHERE equipment_id=101",
                    ),
                    { code: "C4091" },
                );
            },
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}
module.exports = { run };
