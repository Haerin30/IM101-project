const prisma = require("../prisma");
const { ROLES } = require("../auth");
const v = require("../validation");

const priorities = ["Low", "Normal", "High", "Urgent"];
const member = (req) => req.user.role.roleName === ROLES.MEMBER;
const staff = (req) =>
    v.check(
        [ROLES.ADMIN, ROLES.STAFF].includes(req.user.role.roleName),
        "Forbidden.",
        403,
    );
function fields(body, allowed) {
    const b = v.body(body);
    v.check(Object.keys(b).length > 0, "No fields provided.");
    v.check(
        Object.keys(b).every((key) => allowed.includes(key)),
        "Unknown or unauthorized fields.",
    );
    return b;
}
function priority(value) {
    v.check(priorities.includes(value), "Invalid maintenance priority.");
    return value;
}
function own(req, row) {
    v.check(
        !member(req) || row.reportedBy === req.user.userId,
        "Forbidden.",
        403,
    );
}
async function load(db, requestId) {
    const row = await db.maintenanceRequest.findUnique({
        where: { requestId },
    });
    v.check(row, "Maintenance request not found.", 404);
    return row;
}
function editable(row) {
    v.check(
        row.status !== "Resolved",
        "Resolved requests cannot be modified.",
        409,
    );
}

const createRequest = v.endpoint(async (req, res) => {
    const b = fields(
        req.body,
        member(req)
            ? ["description", "facilityId", "equipmentId"]
            : ["description", "facilityId", "equipmentId", "priority"],
    );
    const changes = {
        description: v.text(b.description, "description"),
        priority: b.priority === undefined ? "Normal" : priority(b.priority),
    };
    for (const key of ["facilityId", "equipmentId"])
        if (Object.hasOwn(b, key)) changes[key] = v.integer(b[key], key);
    v.check(
        changes.facilityId || changes.equipmentId,
        "At least one facilityId or equipmentId is required.",
    );
    const data = await v.transaction(prisma, req, async (tx) => {
        if (changes.facilityId)
            v.check(
                await tx.facility.findUnique({
                    where: { facilityId: changes.facilityId },
                    select: { facilityId: true },
                }),
                "Facility not found.",
                404,
            );
        if (changes.equipmentId)
            v.check(
                await tx.equipment.findUnique({
                    where: { equipmentId: changes.equipmentId },
                    select: { equipmentId: true },
                }),
                "Equipment not found.",
                404,
            );
        return tx.maintenanceRequest.create({
            data: { ...changes, reportedBy: req.user.userId, status: "Open" },
        });
    });
    res.status(201).json({ success: true, data });
});
const listRequests = v.endpoint(async (req, res) => {
    const data = await prisma.maintenanceRequest.findMany({
        where: member(req) ? { reportedBy: req.user.userId } : {},
        orderBy: { requestId: "asc" },
    });
    res.json({ success: true, count: data.length, data });
});
const getRequest = v.endpoint(async (req, res) => {
    const data = await load(prisma, v.integer(req.params.id, "requestId"));
    own(req, data);
    res.json({ success: true, data });
});
const editRequest = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "requestId");
    const b = fields(
        req.body,
        member(req) ? ["description"] : ["description", "priority"],
    );
    const changes = {};
    if (Object.hasOwn(b, "description"))
        changes.description = v.text(b.description, "description");
    if (Object.hasOwn(b, "priority")) changes.priority = priority(b.priority);
    const data = await v.transaction(prisma, req, async (tx) => {
        const row = await load(tx, id);
        own(req, row);
        editable(row);
        if (member(req))
            v.check(
                row.status === "Open",
                "Only Open requests can be edited by their reporter.",
                409,
            );
        return tx.maintenanceRequest.update({
            where: { requestId: id },
            data: changes,
        });
    });
    res.json({ success: true, data });
});
const assignRequest = v.endpoint(async (req, res) => {
    staff(req);
    const id = v.integer(req.params.id, "requestId"),
        b = fields(req.body, ["assignedStaffId"]);
    const assignedStaffId = v.integer(b.assignedStaffId, "assignedStaffId");
    const data = await v.transaction(prisma, req, async (tx) => {
        editable(await load(tx, id));
        const user = await tx.user.findUnique({
            where: { userId: assignedStaffId },
            select: { isActive: true, role: { select: { roleName: true } } },
        });
        v.check(
            user?.isActive && user.role.roleName === ROLES.STAFF,
            "Assignee must be active maintenance staff.",
        );
        return tx.maintenanceRequest.update({
            where: { requestId: id },
            data: { assignedStaffId },
        });
    });
    res.json({ success: true, data });
});
const updateStatus = v.endpoint(async (req, res) => {
    staff(req);
    const id = v.integer(req.params.id, "requestId"),
        b = fields(req.body, ["status", "resolutionNotes"]);
    v.check(
        ["Open", "In Progress", "Resolved"].includes(b.status),
        "Invalid maintenance status.",
    );
    const changes = { status: b.status };
    if (b.status === "Resolved") {
        changes.resolutionNotes = v.text(b.resolutionNotes, "resolutionNotes");
        changes.resolvedAt = new Date();
    } else
        v.check(
            !Object.hasOwn(b, "resolutionNotes"),
            "resolutionNotes is only allowed when resolving.",
        );
    const data = await v.transaction(prisma, req, async (tx) => {
        const row = await load(tx, id);
        v.check(
            { Open: "In Progress", "In Progress": "Resolved" }[row.status] ===
                b.status,
            "Invalid maintenance status transition.",
            409,
        );
        return tx.maintenanceRequest.update({
            where: { requestId: id },
            data: changes,
        });
    });
    res.json({ success: true, data });
});
const getHistory = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "requestId");
    own(req, await load(prisma, id));
    const rows = await prisma.auditLog.findMany({
        where: { tableName: "MaintenanceRequest", recordId: id },
        orderBy: { logId: "asc" },
    });
    res.json({
        success: true,
        data: rows.map((row) => ({ ...row, logId: String(row.logId) })),
    });
});
module.exports = {
    createRequest,
    listRequests,
    getRequest,
    editRequest,
    assignRequest,
    updateStatus,
    getHistory,
};
