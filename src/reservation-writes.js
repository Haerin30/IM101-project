const { Router } = require("express");
const { validateReservationCreation } = require("./reservation-validation");
const { createReservationTransaction } = require("./reservation-transaction");
const { publicErrors } = require("./reservation-errors");

function createReservationWrites({
    getPrisma,
    requireRoles,
    readRoles,
    reservationSelect,
    reservationResponse,
}) {
    const router = Router();
    const creators = requireRoles(readRoles);
    const run = createReservationTransaction({ getPrisma });
    function respondError(error, res, next) {
        const mapped = publicErrors[error?.code];
        if (!mapped) return next(error);
        return res
            .status(mapped[0])
            .json({ success: false, message: mapped[1] });
    }
    router.post("/", creators, async (req, res, next) => {
        if (Object.keys(req.query).length)
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Invalid reservation input.",
                });
        const validated = validateReservationCreation(req.body);
        if (!validated.success) return res.status(400).json(validated);
        const { facilityId, purpose, startDatetime, endDatetime } =
            validated.data;
        try {
            const reservation = await run(req.user, async (tx) => {
                const rows =
                    await tx.$queryRaw`CALL im101_private.create_reservation(${facilityId}::integer, ${purpose}::text, ${startDatetime}::timestamptz, ${endDatetime}::timestamptz, NULL::integer)`;
                const id =
                    rows?.length === 1 ? rows[0]?.p_reservation_id : null;
                if (!Number.isInteger(id) || id < 1 || id > 2147483647)
                    throw new Error(
                        "Reservation procedure acknowledgement invalid.",
                    );
                const row = await tx.reservation.findFirst({
                    where: { reservationId: id, requestedBy: req.user.userId },
                    select: reservationSelect,
                });
                if (!row)
                    throw new Error(
                        "Reservation procedure acknowledgement invalid.",
                    );
                return reservationResponse(row);
            });
            res.status(201).json({ success: true, reservation });
        } catch (error) {
            respondError(error, res, next);
        }
    });
    return router;
}
module.exports = { createReservationWrites };
