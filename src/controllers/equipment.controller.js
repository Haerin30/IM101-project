const prisma = require("../prisma");
const v = require("../validation");
const include = {
    category: true,
    homeFacility: { include: { building: true } },
};
function fields(b, creating) {
    v.body(b);
    const data = {};
    for (const key of ["categoryId", "totalQuantity"]) {
        if (creating || b[key] !== undefined) {
            v.check(b[key] !== undefined, key + " is required.");
            data[key] = v.integer(b[key], key);
        }
    }
    if (b.homeFacilityId !== undefined)
        data.homeFacilityId =
            b.homeFacilityId === null
                ? null
                : v.integer(b.homeFacilityId, "homeFacilityId");
    if (creating || b.equipmentName !== undefined)
        data.equipmentName = v.text(b.equipmentName, "equipmentName", 200);
    if (b.conditionStatus !== undefined) {
        v.check(
            ["Good", "Fair", "Damaged"].includes(b.conditionStatus),
            "Invalid conditionStatus.",
        );
        data.conditionStatus = b.conditionStatus;
    }
    if (b.isActive !== undefined) {
        v.check(
            !creating && typeof b.isActive === "boolean",
            "isActive must be a boolean and can only be updated on existing equipment.",
        );
        data.isActive = b.isActive;
    }
    // Stock is derived by PostgreSQL from allocations and open loans.
    if (b.availableQuantity !== undefined) {
        const available = v.integer(
            b.availableQuantity,
            "availableQuantity",
            0,
        );
        v.check(
            creating && available === data.totalQuantity,
            "availableQuantity is derived from loans and reservations; new stock must be fully available.",
        );
    }
    v.check(Object.keys(data).length, "No editable fields provided.");
    return data;
}
const getEquipment = v.endpoint(async (req, res) => {
    res.json({
        success: true,
        data: await prisma.equipment.findMany({
            include,
            orderBy: { equipmentId: "asc" },
        }),
    });
});
const getEquipmentById = v.endpoint(async (req, res) => {
    const data = await prisma.equipment.findUnique({
        where: { equipmentId: v.integer(req.params.id, "equipmentId") },
        include,
    });
    v.check(data, "Equipment not found.", 404);
    res.json({ success: true, data });
});
const createEquipment = v.endpoint(async (req, res) => {
    const data = fields(req.body, true);
    data.availableQuantity = data.totalQuantity;
    const row = await v.transaction(prisma, req, (tx) =>
        tx.equipment.create({ data, include }),
    );
    res.status(201).json({ success: true, data: row });
});
const updateEquipment = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "equipmentId"),
        data = fields(req.body, false);
    const row = await v.transaction(prisma, req, (tx) =>
        tx.equipment.update({ where: { equipmentId: id }, data, include }),
    );
    res.json({ success: true, data: row });
});
const deleteEquipment = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "equipmentId");
    const data = await v.transaction(prisma, req, (tx) =>
        tx.equipment.update({
            where: { equipmentId: id },
            data: { isActive: false },
            include,
        }),
    );
    res.json({ success: true, data });
});
const repairEquipment = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "equipmentId"),
        quantity = v.integer(v.body(req.body).quantity, "quantity");
    const data = await v.transaction(prisma, req, async (tx) => {
        await tx.equipmentRepair.create({
            data: { equipmentId: id, quantity, repairedBy: req.user.userId },
        });
        return tx.equipment.findUnique({ where: { equipmentId: id }, include });
    });
    res.json({ success: true, data });
});
module.exports = {
    getEquipment,
    getEquipmentById,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    repairEquipment,
};
