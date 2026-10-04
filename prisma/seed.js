const prisma = require("../src/prisma");

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
}

main()
    .catch((error) => {
        console.error("Error during seeding:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
