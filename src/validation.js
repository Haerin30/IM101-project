class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function check(value, message, status = 400) {
    if (!value) throw new HttpError(status, message);
}
function integer(value, name, min = 1) {
    check(
        (typeof value === "number" || typeof value === "string") &&
            /^\d+$/.test(String(value)),
        name + " must be an integer.",
    );
    const result = Number(value);
    check(
        Number.isSafeInteger(result) && result >= min && result <= 2147483647,
        name + " is out of range.",
    );
    return result;
}
function text(value, name, max = 2000) {
    check(
        typeof value === "string" &&
            value.trim().length > 0 &&
            value.trim().length <= max,
        name +
            " is required and must be a non-empty string (maximum " +
            max +
            " characters).",
    );
    return value.trim();
}
function body(value) {
    check(
        value && typeof value === "object" && !Array.isArray(value),
        "A JSON object is required.",
    );
    return value;
}
function date(value, name) {
    check(
        typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
                value,
            ),
        name + " must be an ISO timestamp with timezone.",
    );
    const result = new Date(value);
    check(Number.isFinite(result.getTime()), name + " is invalid.");
    check(
        Number(value.slice(11, 13)) < 24 &&
            Number(value.slice(14, 16)) < 60 &&
            Number(value.slice(17, 19)) < 60,
        name + " is invalid.",
    );
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    check(
        month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= new Date(Date.UTC(year, month, 0)).getUTCDate(),
        name + " is invalid.",
    );
    return result;
}
function range(start, end) {
    check(start < end, "startDatetime must precede endDatetime.");
}
function sendError(res, error) {
    let status = error instanceof HttpError ? error.status : 500;
    let message =
        error instanceof HttpError
            ? error.message
            : "Request could not be completed.";
    const detail = error.code + JSON.stringify(error.meta || {});
    if (
        ["P2002", "P2034"].includes(error.code) ||
        /23P01|23514|P0001|40001|40P01/.test(detail)
    ) {
        status = 409;
        message =
            "The request conflicts with current bookings, stock, or lifecycle rules.";
    } else if (error.code === "P2003" || /23503/.test(detail)) {
        status = 400;
        message = "A referenced record does not exist or is still in use.";
    } else if (error.code === "P2025") {
        status = 404;
        message = "Record not found.";
    }
    return res.status(status).json({ success: false, message });
}
const endpoint = (handler) => async (req, res) => {
    try {
        await handler(req, res);
    } catch (error) {
        sendError(res, error);
    }
};
async function transaction(prisma, req, work) {
    return prisma.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT set_config('app.user_id', ${String(req.user.userId)}, true)`;
            return work(tx);
        },
        { isolationLevel: "Serializable" },
    );
}
module.exports = {
    HttpError,
    check,
    integer,
    text,
    body,
    date,
    range,
    endpoint,
    transaction,
};
