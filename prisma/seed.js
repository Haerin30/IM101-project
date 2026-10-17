const bcrypt = require("bcrypt");
const { check } = require("../src/validation");
const { ROLES } = require("../src/auth");
async function seed(prisma, env = process.env) {
    // Validate all account options before any database writes.
    const accounts = [];
    for (const [prefix, roleName] of [
        ["ADMIN", ROLES.ADMIN],
        ["STAFF", ROLES.STAFF],
        ["MEMBER", ROLES.MEMBER],
    ]) {
        const email = env["SEED_" + prefix + "_EMAIL"],
            password = env["SEED_" + prefix + "_PASSWORD"];
        if (email === undefined && password === undefined) continue;
        check(
            typeof email === "string" &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
                email.length <= 254,
            "Invalid seed email.",
        );
        check(
            typeof password === "string" &&
                password.length >= 16 &&
                Buffer.byteLength(password) <= 72,
            "Seed passwords must be 16 characters or longer and at most 72 bytes.",
        );
        check(
            !/^(Admin123!|Staff123!|Faculty123!)$/.test(password),
            "Known default passwords are forbidden.",
        );
        accounts.push({ email, password, roleName });
    }
    check(
        new Set(accounts.map((x) => x.email.toLowerCase())).size ===
            accounts.length,
        "Seed account emails must be distinct.",
    );
    for (const typeName of [
        "Classroom",
        "Laboratory",
        "Lecture Hall",
        "Auditorium",
        "Meeting Room",
    ])
        await prisma.facilityType.upsert({
            where: { typeName },
            update: {},
            create: { typeName },
        });
    for (const categoryName of [
        "Computer Equipment",
        "Audio Visual Equipment",
        "Laboratory Equipment",
        "Office Equipment",
        "Networking Equipment",
    ])
        await prisma.equipmentCategory.upsert({
            where: { categoryName },
            update: {},
            create: { categoryName },
        });
    for (const building of [
        { buildingName: "Main Building", floorCount: 4 },
        { buildingName: "Engineering Building", floorCount: 5 },
        { buildingName: "Science Building", floorCount: 3 },
    ])
        await prisma.building.upsert({
            where: { buildingName: building.buildingName },
            update: {},
            create: building,
        });
    for (const roleName of Object.values(ROLES))
        await prisma.role.upsert({
            where: { roleName },
            update: {},
            create: { roleName },
        });
    for (const statusName of [
        "Pending",
        "Approved",
        "Rejected",
        "Cancelled",
        "Completed",
    ])
        await prisma.reservationStatus.upsert({
            where: { statusName },
            update: {},
            create: { statusName },
        });
    for (const { email, password, roleName } of accounts) {
        const role = await prisma.role.findUnique({ where: { roleName } });
        await prisma.user.upsert({
            where: { email },
            update: {},
            create: {
                roleId: role.roleId,
                email,
                fname: roleName === ROLES.ADMIN ? "Administrator" : "Campus",
                lname: "User",
                passwordHash: await bcrypt.hash(password, 12),
            },
        });
    }
}
if (require.main === module) {
    const prisma = require("../src/prisma");
    seed(prisma)
        .then(() =>
            console.log("Seed completed; existing users were preserved."),
        )
        .catch(() => {
            console.error(
                "Seed failed. Check configuration and database availability.",
            );
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
module.exports = { seed };
