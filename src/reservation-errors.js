const sqlCodes = {
    R4001: "RESERVATION_INPUT",
    R4011: "RESERVATION_AUTHENTICATION",
    R4031: "RESERVATION_ACCESS",
    R4041: "RESERVATION_NOT_FOUND",
    R4091: "RESERVATION_CONFLICT",
    R5031: "RESERVATION_CONFIGURATION",
    40001: "RESERVATION_CONFLICT",
    "40P01": "RESERVATION_CONFLICT",
};

// Only fixed SQLSTATE codes escape; never retain the driver error or its metadata.
function reservationErrorCode(error) {
    try {
        if (error?.code === "P2034") return "RESERVATION_CONFLICT";
        for (const code of [
            error?.code,
            error?.meta?.code,
            error?.meta?.driverAdapterError?.cause?.originalCode,
        ]) {
            if (typeof code === "string" && Object.hasOwn(sqlCodes, code))
                return sqlCodes[code];
        }
    } catch {
        /* Hostile error objects have no trusted diagnostic. */
    }
    return null;
}

const publicErrors = {
    RESERVATION_INPUT: [400, "Invalid reservation input or time interval."],
    RESERVATION_AUTHENTICATION: [401, "Authentication required."],
    RESERVATION_ACCESS: [403, "Access denied."],
    RESERVATION_NOT_FOUND: [404, "Reservation resource not found."],
    RESERVATION_CONFLICT: [
        409,
        "Reservation conflict. Reload before considering another attempt.",
    ],
    RESERVATION_CONFIGURATION: [503, "Reservation configuration unavailable."],
};
module.exports = { reservationErrorCode, publicErrors };
