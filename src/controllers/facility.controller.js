const prisma = require("../prisma");
const v = require("../validation");
const include = { building: true, facilityType: true };
function fields(value, create) {
    const b = { ...v.body(value) },
        data = {};
    for (const [alias, key] of Object.entries({
        building_id: "buildingId",
        facility_type_id: "facilityTypeId",
        facility_name: "facilityName",
        floor_number: "floorNumber",
    })) {
        if (b[alias] !== undefined) {
            v.check(
                b[key] === undefined,
                "Provide only one spelling of " + key,
            );
            b[key] = b[alias];
        }
    }
    for (const key of [
        "buildingId",
        "facilityTypeId",
        "floorNumber",
        "capacity",
    ]) {
        if (create || b[key] !== undefined)
            data[key] = v.integer(b[key], key, key === "floorNumber" ? 0 : 1);
    }
    if (create || b.facilityName !== undefined)
        data.facilityName = v.text(b.facilityName, "facilityName", 200);
    if (b.status !== undefined) {
        v.check(
            ["Available", "Maintenance", "Inactive"].includes(b.status),
            "Invalid facility status.",
        );
        data.status = b.status;
    }
    v.check(Object.keys(data).length, "No editable fields provided.");
    return data;
}
const getFacilities = v.endpoint(async (req, res) => {
    res.json({
        success: true,
        data: await prisma.facility.findMany({
            include,
            orderBy: { facilityId: "asc" },
        }),
    });
});
const getFacilityById = v.endpoint(async (req, res) => {
    const data = await prisma.facility.findUnique({
        where: { facilityId: v.integer(req.params.id, "facilityId") },
        include,
    });
    v.check(data, "Facility not found.", 404);
    res.json({ success: true, data });
});
const createFacility = v.endpoint(async (req, res) => {
    const data = fields(req.body, true);
    res.status(201).json({
        success: true,
        data: await v.transaction(prisma, req, (tx) =>
            tx.facility.create({ data, include }),
        ),
    });
});
const updateFacility = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "facilityId"),
        data = fields(req.body, false);
    res.json({
        success: true,
        data: await v.transaction(prisma, req, (tx) =>
            tx.facility.update({ where: { facilityId: id }, data, include }),
        ),
    });
});
const deleteFacility = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "facilityId");
    res.json({
        success: true,
        data: await v.transaction(prisma, req, (tx) =>
            tx.facility.update({
                where: { facilityId: id },
                data: { status: "Inactive" },
                include,
            }),
        ),
    });
});
module.exports = {
    getFacilities,
    getFacilityById,
    createFacility,
    updateFacility,
    deleteFacility,
};
