const prisma = require("../src/prisma");
const bcrypt = require("bcrypt");

const facilityTypes = [
    "Classroom",
    "Laboratory",
    "Lecture Hall",
    "Auditorium",
    "Meeting Room",
];

const buildings = [
    { buildingName: "Main Building", floorCount: 4 },
    { buildingName: "Engineering Building", floorCount: 5 },
    { buildingName: "Science Building", floorCount: 3 },
];

const equipmentCategories = [
    "Computer Equipment",
    "Audio Visual Equipment",
    "Laboratory Equipment",
    "Office Equipment",
    "Networking Equipment",
];

const roles = [
    "System Administrator",
    "Facility/Maintenance Staff",
    "Faculty Member / Student Organization Representative",
];

const reservationStatuses = [
    "Pending",
    "Approved",
    "Rejected",
    "Cancelled",
    "Completed",
];


async function main() {
    console.log("Seeding database...");

    console.log("Seeding Facility Types...");
    for (const typeName of facilityTypes) {
        const type = await prisma.facilityType.upsert({
            where: { typeName },
            update: {},
            create: { typeName },
        });
        console.log(` - FacilityType: ${type.typeName} (ID: ${type.facilityTypeId})`);
    }

    console.log("Seeding Equipment Categories...");
    for (const categoryName of equipmentCategories) {
        const category = await prisma.equipmentCategory.upsert({
            where: { categoryName },
            update: {},
            create: { categoryName },
        });

        console.log(
            ` - EquipmentCategory: ${category.categoryName} (ID: ${category.categoryId})`
        );
    }

    console.log("Seeding Buildings...");
    for (const building of buildings) {
        const b = await prisma.building.upsert({
            where: { buildingName: building.buildingName },
            update: { floorCount: building.floorCount },
            create: {
                buildingName: building.buildingName,
                floorCount: building.floorCount,
            },
        });
        console.log(` - Building: ${b.buildingName} (ID: ${b.buildingId}, Floors: ${b.floorCount})`);
    }

    console.log("Seeding completed successfully.");

    console.log("Seeding Reservation Statuses...");
    for (const statusName of reservationStatuses) {
        const status = await prisma.reservationStatus.upsert({
            where: { statusName },
            update: {},
            create: { statusName },
        });

        console.log(
            ` - ReservationStatus: ${status.statusName} (ID: ${status.statusId})`
        );
    }

    console.log("Seeding Roles...");
    for (const roleName of roles) {
        const role = await prisma.role.upsert({
            where: { roleName },
            update: {},
            create: { roleName },
        });

        console.log(` - Role: ${role.roleName} (ID: ${role.roleId})`);
    }

    console.log("Seeding Users...");

    const adminRole = await prisma.role.findUnique({
        where: {
            roleName: "System Administrator",
        },
    });

    const staffRole = await prisma.role.findUnique({
        where: {
            roleName: "Facility/Maintenance Staff",
        },
    });

    const facultyRole = await prisma.role.findUnique({
        where: {
            roleName: "Faculty Member / Student Organization Representative",
        },
    });

    const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
    const staffPasswordHash = await bcrypt.hash("Staff123!", 10);
    const facultyPasswordHash = await bcrypt.hash("Faculty123!", 10);

    const users = [
        {
            roleId: adminRole.roleId,
            fname: "Admin",
            lname: "User",
            email: "admin@campus.local",
            passwordHash: adminPasswordHash,
            idNumber: "ADM-001",
            contactNumber: "09170000001",
        },
        {
            roleId: staffRole.roleId,
            fname: "Staff",
            lname: "User",
            email: "staff@campus.local",
            passwordHash: staffPasswordHash,
            idNumber: "STF-001",
            contactNumber: "09170000002",
        },
        {
            roleId: facultyRole.roleId,
            fname: "Faculty",
            lname: "User",
            email: "faculty@campus.local",
            passwordHash: facultyPasswordHash,
            idNumber: "FAC-001",
            contactNumber: "09170000003",
        },
    ];

    for (const userData of users) {
        const user = await prisma.user.upsert({
            where: {
                email: userData.email,
            },
            update: {
                roleId: userData.roleId,
                fname: userData.fname,
                lname: userData.lname,
                passwordHash: userData.passwordHash,
                idNumber: userData.idNumber,
                contactNumber: userData.contactNumber,
                isActive: true,
            },
            create: userData,
        });

        console.log(
            ` - User: ${user.fname} ${user.lname} (ID: ${user.userId})`
        );
    }
}

main()
    .catch((error) => {
        console.error("Error during seeding:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
