const prisma = require("../prisma");
const { ROLES } = require("../auth");
const v = require("../validation");
const member = (req) => req.user.role.roleName === ROLES.MEMBER;
const include = {
    facility: true,
    status: true,
    equipmentItems: true,
    requester: {
        select: { userId: true, fname: true, lname: true, email: true },
    },
    approver: { select: { userId: true, fname: true, lname: true } },
};
function own(req, row) {
    v.check(
        !member(req) || row.requestedBy === req.user.userId,
        "Forbidden.",
        403,
    );
}
async function load(tx, id) {
    const row = await tx.reservation.findUnique({
        where: { reservationId: id },
        include: { status: true },
    });
    v.check(row, "Reservation not found.", 404);
    return row;
}
async function schedule(tx, facilityId, startDatetime, endDatetime, except) {
    v.range(startDatetime, endDatetime);
    const facility = await tx.facility.findUnique({ where: { facilityId } });
    v.check(facility, "Facility not found.", 404);
    v.check(facility.status === "Available", "Facility is unavailable.", 409);
    const conflict = await tx.reservation.findFirst({
        where: {
            facilityId,
            blocksSchedule: true,
            ...(except ? { reservationId: { not: except } } : {}),
            startDatetime: { lt: endDatetime },
            endDatetime: { gt: startDatetime },
        },
    });
    v.check(!conflict, "Facility is already booked for this time.", 409);
}
function items(value) {
    v.check(
        Array.isArray(value) && value.length <= 100,
        "equipmentItems must be an array of at most 100 items.",
    );
    const rows = value.map((item) => {
        v.body(item);
        return {
            equipmentId: v.integer(item.equipmentId, "equipmentId"),
            quantity: v.integer(item.quantity, "quantity"),
        };
    });
    v.check(
        new Set(rows.map((x) => x.equipmentId)).size === rows.length,
        "Duplicate equipment items are not allowed.",
    );
    return rows.sort((a, b) => a.equipmentId - b.equipmentId);
}
const createReservation = v.endpoint(async (req, res) => {
    const b = v.body(req.body),
        facilityId = v.integer(b.facilityId, "facilityId"),
        purpose = v.text(b.purpose, "purpose");
    const startDatetime = v.date(b.startDatetime, "startDatetime"),
        endDatetime = v.date(b.endDatetime, "endDatetime");
    v.range(startDatetime, endDatetime);
    v.check(
        startDatetime > new Date(),
        "Reservations must start in the future.",
    );
    const equipmentItems =
        b.equipmentItems === undefined ? [] : items(b.equipmentItems);
    const data = await v.transaction(prisma, req, async (tx) => {
        await schedule(tx, facilityId, startDatetime, endDatetime);
        const status = await tx.reservationStatus.findUnique({
            where: { statusName: "Pending" },
        });
        v.check(status, "Reservation statuses have not been configured.", 503);
        return tx.reservation.create({
            data: {
                facilityId,
                purpose,
                startDatetime,
                endDatetime,
                requestedBy: req.user.userId,
                statusId: status.statusId,
                equipmentItems: { create: equipmentItems },
            },
            include,
        });
    });
    res.status(201).json({ success: true, data });
});
const getReservations = v.endpoint(async (req, res) => {
    const data = await prisma.reservation.findMany({
        where: member(req) ? { requestedBy: req.user.userId } : {},
        include,
        orderBy: { reservationId: "asc" },
    });
    res.json({ success: true, count: data.length, data });
});
const getReservationById = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "reservationId");
    const data = await prisma.reservation.findUnique({
        where: { reservationId: id },
        include,
    });
    v.check(data, "Reservation not found.", 404);
    own(req, data);
    res.json({ success: true, data });
});
const updateReservation = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "reservationId"),
        b = v.body(req.body);
    v.check(
        ["purpose", "startDatetime", "endDatetime", "equipmentItems"].some(
            (key) => b[key] !== undefined,
        ),
        "No editable fields provided.",
    );
    const changes = {};
    if (b.purpose !== undefined) changes.purpose = v.text(b.purpose, "purpose");
    if (b.startDatetime !== undefined)
        changes.startDatetime = v.date(b.startDatetime, "startDatetime");
    if (b.endDatetime !== undefined)
        changes.endDatetime = v.date(b.endDatetime, "endDatetime");
    const allocations =
        b.equipmentItems === undefined ? undefined : items(b.equipmentItems);
    const data = await v.transaction(prisma, req, async (tx) => {
        const row = await load(tx, id);
        own(req, row);
        v.check(
            row.status.statusName === "Pending",
            "Only pending reservations can be edited.",
            409,
        );
        const start = changes.startDatetime || row.startDatetime,
            end = changes.endDatetime || row.endDatetime;
        v.check(start > new Date(), "Reservations must start in the future.");
        await schedule(tx, row.facilityId, start, end, id);
        if (allocations) {
            await tx.reservationEquipment.deleteMany({
                where: { reservationId: id },
            });
            changes.equipmentItems = { create: allocations };
        }
        return tx.reservation.update({
            where: { reservationId: id },
            data: changes,
            include,
        });
    });
    res.json({ success: true, data });
});
const transitionReservation = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "reservationId"),
        b = v.body(req.body);
    v.check(
        ["Approved", "Rejected", "Cancelled", "Completed"].includes(b.status),
        "Invalid reservation status.",
    );
    if (member(req)) v.check(b.status === "Cancelled", "Forbidden.", 403);
    const data = await v.transaction(prisma, req, async (tx) => {
        const row = await load(tx, id);
        own(req, row);
        const allowed = {
            Pending: ["Approved", "Rejected", "Cancelled"],
            Approved: ["Cancelled", "Completed"],
        };
        v.check(
            allowed[row.status.statusName]?.includes(b.status),
            "Invalid status transition.",
            409,
        );
        if (b.status === "Approved") {
            v.check(
                row.startDatetime > new Date(),
                "Cannot approve a reservation that has started.",
                409,
            );
            await schedule(
                tx,
                row.facilityId,
                row.startDatetime,
                row.endDatetime,
                id,
            );
        }
        if (b.status === "Completed")
            v.check(
                row.endDatetime <= new Date(),
                "Reservation has not ended.",
                409,
            );
        await tx.$executeRaw`CALL transition_reservation(${id}, ${b.status}, ${req.user.userId})`;
        return tx.reservation.findUnique({
            where: { reservationId: id },
            include,
        });
    });
    res.json({ success: true, data });
});
const getReservationHistory = v.endpoint(async (req, res) => {
    const id = v.integer(req.params.id, "reservationId");
    own(req, await load(prisma, id));
    const rows = await prisma.auditLog.findMany({
        where: {
            tableName: { in: ["Reservation", "ReservationEquipment"] },
            recordId: id,
        },
        orderBy: { logId: "asc" },
    });
    res.json({
        success: true,
        data: rows.map((row) => ({ ...row, logId: String(row.logId) })),
    });
});
module.exports = {
    createReservation,
    getReservations,
    getReservationById,
    updateReservation,
    transitionReservation,
    getReservationHistory,
};
